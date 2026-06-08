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

/** Public archival nodes for historical `block_id` / `block_hash` queries. */
export const ARCHIVAL_RPC_URLS: Record<Network, string> = {
  testnet: 'https://archival-rpc.testnet.near.org',
  mainnet: 'https://archival-rpc.mainnet.near.org',
};

export function resolveNearArchivalRpcUrl(network: Network = 'testnet'): string {
  if (typeof process !== 'undefined' && process.env?.NEAR_ARCHIVAL_RPC_URL) {
    return process.env.NEAR_ARCHIVAL_RPC_URL;
  }
  return ARCHIVAL_RPC_URLS[network];
}

export function isHistoricalBlockQuery(method: string, params: unknown): boolean {
  if (!params || typeof params !== 'object') {
    return false;
  }

  const blockParams = params as Record<string, unknown>;
  if (method === 'block') {
    return blockParams.block_id != null || blockParams.block_hash != null;
  }

  if (method !== 'query') {
    return false;
  }

  return blockParams.block_id != null || blockParams.block_hash != null;
}

export function isGarbageCollectedRpcError(
  error: NearRpcResponse['error'] | undefined
): boolean {
  if (!error) {
    return false;
  }

  const causeName =
    error.cause && typeof error.cause === 'object' && 'name' in error.cause
      ? String((error.cause as { name?: string }).name ?? '')
      : '';

  if (
    causeName === 'GARBAGE_COLLECTED_BLOCK' ||
    causeName === 'UNKNOWN_BLOCK'
  ) {
    return true;
  }

  const data = typeof error.data === 'string' ? error.data : '';
  const message = error.message ?? '';
  return /garbage collected|unknown block/i.test(`${message} ${data}`);
}

function isGarbageCollectedRpcMessage(message: string): boolean {
  return /GARBAGE_COLLECTED_BLOCK|UNKNOWN_BLOCK|garbage collected|unknown block/i.test(
    message
  );
}

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

/** True in browser runtimes — callers must not use private RPC keys in client bundles. */
export function isBrowserNearRpcContext(): boolean {
  return typeof window !== 'undefined';
}

export interface ConfiguredNearRpcUrlOptions {
  /** Force public FastNear; defaults to {@link isBrowserNearRpcContext}. */
  publicOnly?: boolean;
  lavaApiKey?: string;
  primaryUrl?: string;
}

/**
 * Standard primary URL for OnSocial services.
 * Server: NEAR_RPC_URL → Lava (key) → FastNear.
 * Browser (default): public FastNear only.
 */
export function resolveConfiguredNearRpcUrl(
  network: Network,
  opts?: ConfiguredNearRpcUrlOptions
): string {
  if (opts?.primaryUrl) return opts.primaryUrl;
  const publicOnly = opts?.publicOnly ?? isBrowserNearRpcContext();
  if (publicOnly) return FALLBACK_RPC_URLS[network];
  return resolveNearRpcUrl(network, { lavaApiKey: opts?.lavaApiKey });
}

export interface ConfiguredNearRpcOptions
  extends Omit<NearRpcConfig, 'primaryUrl' | 'fallbackUrl' | 'network'> {
  network: Network;
  publicOnly?: boolean;
  lavaApiKey?: string;
  primaryUrl?: string;
  fallbackUrl?: string;
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
        // Opt out of Next.js patched fetch dedupe/cache (avoids body.tee clone bugs).
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Rate limits should fail over immediately — retrying the same URL makes it worse. */
  function isRateLimitedRpcError(code: string | number | undefined): boolean {
    return code === -429 || code === 429;
  }

  /** Transient/server-side errors are retryable; client errors are not. */
  function isRetryableRpcError(code: string | number | undefined): boolean {
    if (isRateLimitedRpcError(code)) return false;
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
        if (res.status === 429) {
          throw new Error(`HTTP 429: rate limited by ${url}`);
        }

        const json = (await res.json()) as NearRpcResponse;

        if (!res.ok) {
          if (json.error && isGarbageCollectedRpcError(json.error)) {
            return json;
          }
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        if (json.error) {
          const code = json.error.cause?.name ?? json.error.code;
          if (isGarbageCollectedRpcError(json.error)) {
            return json;
          }
          if (isRateLimitedRpcError(code)) {
            throw new Error(
              `RPC rate limit [${code}]: ${json.error.message || JSON.stringify(json.error)}`,
            );
          }
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
        if (/RPC rate limit|HTTP 429/i.test(lastError.message)) {
          break;
        }
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

  async function tryArchivalHistoricalQuery<T>(
    method: string,
    params: unknown,
    body: string
  ): Promise<NearRpcResponse<T> | null> {
    if (!isHistoricalBlockQuery(method, params)) {
      return null;
    }

    const archivalUrl = resolveNearArchivalRpcUrl(network);
    try {
      onLog('info', 'Trying archival RPC for historical query', { archivalUrl });
      const result = await tryProvider(archivalUrl, body, 1);
      if (result.error && isGarbageCollectedRpcError(result.error)) {
        return null;
      }
      return result as NearRpcResponse<T>;
    } catch {
      return null;
    }
  }

  return {
    async call<T = unknown>(method: string, params: unknown): Promise<NearRpcResponse<T>> {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 'onsocial', method, params });
      const historical = isHistoricalBlockQuery(method, params);

      if (!isCircuitOpen()) {
        try {
          const result = await tryProvider(primaryUrl, body, maxRetries);
          if (result.error && historical && isGarbageCollectedRpcError(result.error)) {
            const archival = await tryArchivalHistoricalQuery<T>(method, params, body);
            if (archival?.result != null) {
              recordSuccess();
              return archival;
            }
          }
          if (result.error) {
            return result as NearRpcResponse<T>;
          }
          recordSuccess();
          return result as NearRpcResponse<T>;
        } catch (err) {
          recordFailure();
          const msg = err instanceof Error ? err.message : String(err);
          if (historical && isGarbageCollectedRpcMessage(msg)) {
            const archival = await tryArchivalHistoricalQuery<T>(method, params, body);
            if (archival?.result != null) {
              return archival;
            }
          }
          onLog('warn', 'Primary RPC failed, falling back', {
            primaryUrl,
            fallbackUrl,
            error: msg,
          });
        }
      }

      try {
        const result = await tryProvider(fallbackUrl, body, maxRetries);
        if (result.error && historical && isGarbageCollectedRpcError(result.error)) {
          const archival = await tryArchivalHistoricalQuery<T>(method, params, body);
          if (archival?.result != null) {
            return archival;
          }
        }
        if (result.error) {
          return result as NearRpcResponse<T>;
        }
        return result as NearRpcResponse<T>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (historical && isGarbageCollectedRpcMessage(msg)) {
          const archival = await tryArchivalHistoricalQuery<T>(method, params, body);
          if (archival?.result != null) {
            return archival;
          }
        }
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

/**
 * Create a NEAR RPC client with OnSocial defaults:
 * Lava (or NEAR_RPC_URL) primary on server, FastNear fallback.
 */
export function createConfiguredNearRpc(options: ConfiguredNearRpcOptions): NearRpc {
  const { network, publicOnly, lavaApiKey, primaryUrl, fallbackUrl, ...rest } =
    options;

  return createNearRpc({
    ...rest,
    network,
    primaryUrl: resolveConfiguredNearRpcUrl(network, {
      publicOnly,
      lavaApiKey,
      primaryUrl,
    }),
    fallbackUrl: fallbackUrl ?? FALLBACK_RPC_URLS[network],
  });
}

// --- BFF (browser → server → Lava) ---

/** Safe read-only methods for browser-facing JSON-RPC BFF routes. */
export const READ_ONLY_NEAR_RPC_METHODS = [
  'query',
  'EXPERIMENTAL_tx_status',
  'block',
  'gas_price',
  'status',
  'network_info',
] as const;

export const READ_ONLY_NEAR_RPC_METHOD_SET: ReadonlySet<string> = new Set(
  READ_ONLY_NEAR_RPC_METHODS
);

export interface NearJsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  network?: Network;
}

export interface BffNearRpcClientOptions {
  endpoint: string;
  network?: Network;
  fetchImpl?: typeof fetch;
}

/** Browser-safe {@link NearRpc} — POSTs JSON-RPC to a server BFF route. */
export function createBffNearRpcClient(options: BffNearRpcClientOptions): NearRpc {
  const { endpoint, network, fetchImpl = fetch } = options;

  return {
    async call<T = unknown>(
      method: string,
      params: unknown
    ): Promise<NearRpcResponse<T>> {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'onsocial-bff',
          method,
          params,
          network,
        } satisfies NearJsonRpcRequest),
      });

      const payload = (await response.json()) as NearRpcResponse<T>;

      if (!response.ok) {
        throw new Error(
          payload.error?.message ??
            `NEAR RPC BFF failed (HTTP ${response.status})`
        );
      }

      return payload;
    },

    getActiveUrl() {
      return endpoint;
    },

    resetCircuit() {},
  };
}

export interface ResolveNearRpcBffEndpointOptions {
  path?: string;
  origin?: string;
}

/** HTTP JSON-RPC URL for ref-sdk / near-api-js (points at app BFF route). */
export function resolveNearRpcBffEndpoint(
  opts?: ResolveNearRpcBffEndpointOptions
): string {
  const path = opts?.path ?? '/api/near/rpc';

  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }

  if (typeof process === 'undefined') {
    return `http://127.0.0.1:3000${path}`;
  }

  const port = process.env.PORT ?? '3000';
  const base =
    opts?.origin ??
    process.env.INTERNAL_RPC_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? process.env.VERCEL_URL.startsWith('http')
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`
      : `http://127.0.0.1:${port}`);

  return `${base.replace(/\/$/, '')}${path}`;
}

export interface HandleNearJsonRpcOptions {
  allowedMethods?: ReadonlySet<string>;
  defaultNetwork: Network;
  getRpc: (network: Network) => NearRpc;
}

export async function handleNearJsonRpcRequest(
  body: NearJsonRpcRequest,
  options: HandleNearJsonRpcOptions
): Promise<NearRpcResponse<unknown>> {
  const method = body.method?.trim();
  const id = body.id ?? 'onsocial-bff';
  const allowed = options.allowedMethods ?? READ_ONLY_NEAR_RPC_METHOD_SET;

  if (!method) {
    return {
      jsonrpc: '2.0',
      id: String(id),
      error: { code: -32600, message: 'Missing RPC method' },
    };
  }

  if (!allowed.has(method)) {
    return {
      jsonrpc: '2.0',
      id: String(id),
      error: { code: -32601, message: `RPC method not allowed: ${method}` },
    };
  }

  const network =
    body.network === 'mainnet' || body.network === 'testnet'
      ? body.network
      : options.defaultNetwork;
  const response = await options.getRpc(network).call(method, body.params ?? {});

  return {
    jsonrpc: '2.0',
    id: String(body.id ?? response.id ?? id),
    result: response.result,
    error: response.error,
  };
}

export async function handleNearJsonRpcPost(
  body: NearJsonRpcRequest | NearJsonRpcRequest[],
  options: HandleNearJsonRpcOptions
): Promise<NearRpcResponse<unknown> | NearRpcResponse<unknown>[]> {
  if (Array.isArray(body)) {
    return Promise.all(body.map((entry) => handleNearJsonRpcRequest(entry, options)));
  }
  return handleNearJsonRpcRequest(body, options);
}

export function createNearRpcRegistry(
  factory: (network: Network) => NearRpc
): (network: Network) => NearRpc {
  const clients: Partial<Record<Network, NearRpc>> = {};

  return (network: Network) => {
    const existing = clients[network];
    if (existing) return existing;
    const rpc = factory(network);
    clients[network] = rpc;
    return rpc;
  };
}

// --- BFF authorization (browser-only; blocks public RPC relay abuse) ---

export type NearRpcBffHeaders = {
  get(name: string): string | null;
};

export interface NearRpcBffAuthOptions {
  /** Normalized origins, e.g. `https://onsocial.id` */
  allowedOrigins: ReadonlySet<string>;
  /** Optional server-to-server bypass (never expose to the browser). */
  internalSecret?: string;
  internalHeaderName?: string;
}

function normalizeHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function isNearRpcBffOriginAllowed(
  originOrReferer: string | null | undefined,
  allowedOrigins: ReadonlySet<string>
): boolean {
  if (!originOrReferer) return false;
  const normalized = normalizeHttpOrigin(originOrReferer);
  return normalized != null && allowedOrigins.has(normalized);
}

function secretsEqual(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Allow only same-site browser traffic or trusted internal callers.
 * Rejects anonymous curl/postman and cross-origin sites.
 */
export function isNearRpcBffAuthorized(
  headers: NearRpcBffHeaders,
  options: NearRpcBffAuthOptions
): boolean {
  const internalHeader = options.internalHeaderName ?? 'x-onsocial-internal-rpc';
  const internalSecret = options.internalSecret?.trim();
  if (internalSecret) {
    const provided = headers.get(internalHeader)?.trim();
    if (provided && secretsEqual(internalSecret, provided)) {
      return true;
    }
  }

  const secFetchSite = headers.get('sec-fetch-site')?.toLowerCase();
  if (secFetchSite !== 'same-origin' && secFetchSite !== 'same-site') {
    return false;
  }

  const origin = headers.get('origin');
  const referer = headers.get('referer');
  return (
    isNearRpcBffOriginAllowed(origin, options.allowedOrigins) ||
    isNearRpcBffOriginAllowed(referer, options.allowedOrigins)
  );
}
