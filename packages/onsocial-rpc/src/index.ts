// @onsocial/rpc — NEAR JSON-RPC client with retry, failover, and circuit breaker.
// Zero runtime dependencies (native fetch). Callers inject the Lava API key.

// --- Types ---

export type Network = 'mainnet' | 'testnet';

export interface NearRpcConfig {
  primaryUrl: string;
  fallbackUrl?: string;
  network?: Network;
  /** @default 5000 */
  timeoutMs?: number;
  /** Retries per provider before failover. @default 2 */
  maxRetries?: number;
  /** @default 200 */
  baseDelayMs?: number;
  /** @default 5 */
  circuitBreakerThreshold?: number;
  /** Half-open window in ms. @default 30000 */
  circuitBreakerWindowMs?: number;
  onLog?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

export interface NearRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: { code: number; message: string; data?: unknown; cause?: { name: string } };
}

export interface NearRpc {
  call<T = unknown>(method: string, params: unknown): Promise<NearRpcResponse<T>>;
  getActiveUrl(): string;
  resetCircuit(): void;
}

// --- Default endpoints (public, no key required) ---

export const FALLBACK_RPC_URLS: Record<Network, string> = {
  testnet: 'https://test.rpc.fastnear.com',
  mainnet: 'https://free.rpc.fastnear.com',
};

// --- URL resolution ---

const LAVA_GATEWAY_BASE: Record<Network, string> = {
  testnet: 'https://g.w.lavanet.xyz/gateway/neart/rpc-http',
  mainnet: 'https://g.w.lavanet.xyz/gateway/near/rpc-http',
};

/** Build private Lava URL. Returns `undefined` when no key is provided. */
export function buildLavaUrl(apiKey: string | undefined, network: Network): string | undefined {
  if (!apiKey) return undefined;
  return `${LAVA_GATEWAY_BASE[network]}/${apiKey}`;
}

export interface ResolveOptions {
  lavaApiKey?: string;
}

/**
 * Resolve primary RPC URL.
 * Priority: NEAR_RPC_URL env → lavaApiKey → LAVA_API_KEY env → FASTNEAR.
 */
export function resolveNearRpcUrl(network: Network = 'testnet', opts?: ResolveOptions): string {
  if (typeof process !== 'undefined') {
    if (process.env?.NEAR_RPC_URL) return process.env.NEAR_RPC_URL;
    const key = opts?.lavaApiKey || process.env?.LAVA_API_KEY;
    const lavaUrl = buildLavaUrl(key, network);
    if (lavaUrl) return lavaUrl;
  }
  return FALLBACK_RPC_URLS[network];
}

// --- Circuit breaker ---

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

// --- Factory ---

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

  /** Transient/server-side errors are retryable; client errors are not. */
  function isRetryableRpcError(code: string | number | undefined): boolean {
    if (typeof code === 'number') return code >= -32000;
    if (typeof code === 'string') {
      return ['TIMEOUT', 'INTERNAL_ERROR', 'SERVER_ERROR'].includes(code);
    }
    return true;
  }

  /** Attempt a provider up to `retries` times with exponential backoff. */
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
          return json; // non-retryable (e.g. invalid params)
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

  // --- Public API ---

  return {
    async call<T = unknown>(method: string, params: unknown): Promise<NearRpcResponse<T>> {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 'onsocial', method, params });

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

      try {
        const result = await tryProvider(fallbackUrl, body, maxRetries);
        return result as NearRpcResponse<T>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onLog('error', 'All RPC providers failed', { primaryUrl, fallbackUrl, error: msg });
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
