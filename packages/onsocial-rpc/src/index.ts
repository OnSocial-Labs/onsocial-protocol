// @onsocial/rpc — NEAR RPC client with automatic failover
//
// Primary:   NEAR_RPC_URL env var (set in .env.production)
// Secondary: Built-in per-network endpoints (updated centrally below)
//
// Features:
//   - Retry with exponential backoff per provider
//   - Per-request timeout via AbortController
//   - Circuit breaker to skip a dead primary
//   - Structured logging callback for observability
//   - Zero runtime dependencies (native fetch)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Network = 'mainnet' | 'testnet';

export interface NearRpcConfig {
  /** Primary RPC endpoint. Typically read from NEAR_RPC_URL env var. */
  primaryUrl: string;
  /** Secondary RPC endpoint. Defaults to built-in per-network URL. */
  fallbackUrl?: string;
  /** Network — resolves the fallback when `fallbackUrl` is omitted. */
  network?: Network;
  /** Timeout per HTTP request in ms. @default 5000 */
  timeoutMs?: number;
  /** Retry attempts *per provider* before failover. @default 2 */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms. @default 200 */
  baseDelayMs?: number;
  /** Consecutive failures before the circuit breaker opens. @default 5 */
  circuitBreakerThreshold?: number;
  /** Window (ms) after which a tripped breaker retries the primary. @default 30000 */
  circuitBreakerWindowMs?: number;
  /** Structured logging callback. */
  onLog?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

export interface NearRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: { code: number; message: string; data?: unknown; cause?: { name: string } };
}

export interface NearRpc {
  /** Execute a JSON-RPC call with automatic retry + failover. */
  call<T = unknown>(method: string, params: unknown): Promise<NearRpcResponse<T>>;
  /** URL that will be tried first on the next call. */
  getActiveUrl(): string;
  /** Manually reset the circuit breaker. */
  resetCircuit(): void;
}

// ---------------------------------------------------------------------------
// Default RPC endpoints — public, no API key required
// Primary: Lava public endpoints (high availability)
// Secondary: FASTNEAR (fallback)
// ---------------------------------------------------------------------------

export const DEFAULT_RPC_URLS: Record<Network, string> = {
  testnet: 'https://neart.lava.build',
  mainnet: 'https://near.lava.build',
};

export const FALLBACK_RPC_URLS: Record<Network, string> = {
  testnet: 'https://test.rpc.fastnear.com',
  mainnet: 'https://free.rpc.fastnear.com',
};

// ---------------------------------------------------------------------------
// Resolve helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the primary RPC URL from `NEAR_RPC_URL` env var.
 * Returns the secondary endpoint when the env var is not set (dev / CI).
 */
export function resolveNearRpcUrl(network: Network = 'testnet'): string {
  if (typeof process !== 'undefined' && process.env?.NEAR_RPC_URL) {
    return process.env.NEAR_RPC_URL;
  }
  return DEFAULT_RPC_URLS[network];
}

// ---------------------------------------------------------------------------
// Circuit breaker state
// ---------------------------------------------------------------------------

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const noop = () => {};

export function createNearRpc(config: NearRpcConfig): NearRpc {
  const {
    primaryUrl,
    network = 'testnet',
    timeoutMs = 5_000,
    maxRetries = 2,
    baseDelayMs = 200,
    circuitBreakerThreshold = 5,
    circuitBreakerWindowMs = 30_000,
    onLog = noop,
  } = config;

  const fallbackUrl = config.fallbackUrl ?? FALLBACK_RPC_URLS[network];

  const circuit: CircuitState = { failures: 0, lastFailure: 0, open: false };

  // -- Circuit helpers -----------------------------------------------------

  function isCircuitOpen(): boolean {
    if (!circuit.open) return false;
    if (Date.now() - circuit.lastFailure > circuitBreakerWindowMs) {
      circuit.open = false;
      circuit.failures = 0;
      onLog('info', 'Circuit breaker half-open, retrying primary', { primaryUrl });
      return false;
    }
    return true;
  }

  function recordFailure(): void {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= circuitBreakerThreshold) {
      circuit.open = true;
      onLog('warn', 'Circuit breaker opened — routing to fallback', {
        failures: circuit.failures,
        fallbackUrl,
      });
    }
  }

  function recordSuccess(): void {
    if (circuit.failures > 0) {
      circuit.failures = 0;
      circuit.open = false;
    }
  }

  // -- HTTP helpers --------------------------------------------------------

  async function fetchWithTimeout(url: string, body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** True when the error code is transient / server-side. */
  function isRetryableRpcError(code: string | number | undefined): boolean {
    if (typeof code === 'number') return code >= -32000;
    if (typeof code === 'string') {
      return ['TIMEOUT', 'INTERNAL_ERROR', 'SERVER_ERROR'].includes(code);
    }
    return true;
  }

  async function tryProvider(
    url: string,
    body: string,
    retries: number,
  ): Promise<NearRpcResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          const jitter = Math.random() * 50;
          const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
          await new Promise((r) => setTimeout(r, delay));
        }

        const res = await fetchWithTimeout(url, body);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const json = (await res.json()) as NearRpcResponse;

        if (json.error) {
          const code = json.error.cause?.name ?? json.error.code;
          if (isRetryableRpcError(code)) {
            throw new Error(
              `RPC error [${code}]: ${json.error.message || JSON.stringify(json.error)}`,
            );
          }
          // Non-retryable (e.g. invalid params) — return as-is
          return json;
        }

        return json;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          onLog('warn', `Attempt ${attempt + 1}/${retries + 1} failed, retrying`, {
            url,
            error: lastError.message,
          });
        }
      }
    }

    throw lastError!;
  }

  // -- Public API ----------------------------------------------------------

  return {
    async call<T = unknown>(method: string, params: unknown): Promise<NearRpcResponse<T>> {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 'onsocial', method, params });

      // 1. Try primary (unless circuit is open)
      if (!isCircuitOpen()) {
        try {
          const result = await tryProvider(primaryUrl, body, maxRetries);
          recordSuccess();
          return result as NearRpcResponse<T>;
        } catch (err) {
          recordFailure();
          const msg = err instanceof Error ? err.message : String(err);
          onLog('warn', 'Primary RPC failed, falling back', {
            primaryUrl,
            fallbackUrl,
            error: msg,
          });
        }
      }

      // 2. Fallback
      try {
        const result = await tryProvider(fallbackUrl, body, maxRetries);
        return result as NearRpcResponse<T>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onLog('error', 'All RPC providers failed', {
          primaryUrl,
          fallbackUrl,
          error: msg,
        });
        throw new Error(`All NEAR RPC providers failed. Last error: ${msg}`);
      }
    },

    getActiveUrl(): string {
      return isCircuitOpen() ? fallbackUrl : primaryUrl;
    },

    resetCircuit(): void {
      circuit.failures = 0;
      circuit.lastFailure = 0;
      circuit.open = false;
    },
  };
}
