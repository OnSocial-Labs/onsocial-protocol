// @onsocial/rpc — NEAR JSON-RPC client with retry, failover, and circuit breaker.
// Zero runtime dependencies (native fetch). Server callers inject a FastNear
// bearer key and a Lava key. The browser path stays on public endpoints.

// --- Types ---

export type Network = 'mainnet' | 'testnet';

export interface NearRpcEndpoint {
  url: string;
  /** Sent as `Authorization` for this endpoint only. Never logged. */
  authorization?: string;
}

export interface NearRpcConfig {
  primaryUrl: string;
  fallbackUrl?: string;
  /**
   * Ordered endpoints. The first is tried on a healthy client. The next is
   * tried only after the current one throws. When set, this replaces
   * `primaryUrl` + `fallbackUrl` for routing.
   */
  endpoints?: NearRpcEndpoint[];
  network?: Network;
  /**
   * Authorization header for `primaryUrl` when `endpoints` is omitted.
   * Never put this value in a URL.
   */
  primaryAuthorization?: string;
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
  onLog?: (
    level: 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
}

export interface NearRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
    cause?: { name: string };
  };
}

export interface NearRpc {
  call<T = unknown>(
    method: string,
    params: unknown
  ): Promise<NearRpcResponse<T>>;
  getActiveUrl(): string;
  resetCircuit(): void;
}

// --- Default endpoints (public, no key required) ---

export const FALLBACK_RPC_URLS: Record<Network, string> = {
  testnet: 'https://test.rpc.fastnear.com',
  mainnet: 'https://free.rpc.fastnear.com',
};

/** Official NEAR RPC — used as failover when primary is already FastNear. */
export const NEAR_ORG_RPC_URLS: Record<Network, string> = {
  testnet: 'https://rpc.testnet.near.org',
  mainnet: 'https://rpc.mainnet.near.org',
};

/**
 * Keyed FastNear hosts. The API key is sent as `Authorization: Bearer`,
 * not in the URL, so logs and `getActiveUrl()` stay free of the secret.
 */
export const KEYED_FASTNEAR_RPC_URLS: Record<Network, string> = {
  testnet: 'https://rpc.testnet.fastnear.com',
  mainnet: 'https://rpc.mainnet.fastnear.com',
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Public archival nodes for historical `block_id` / `block_hash` queries. */
export const ARCHIVAL_RPC_URLS: Record<Network, string> = {
  testnet: 'https://archival-rpc.testnet.near.org',
  mainnet: 'https://archival-rpc.mainnet.near.org',
};

export function resolveNearArchivalRpcUrl(
  network: Network = 'testnet'
): string {
  if (typeof process !== 'undefined' && process.env?.NEAR_ARCHIVAL_RPC_URL) {
    return process.env.NEAR_ARCHIVAL_RPC_URL;
  }
  return ARCHIVAL_RPC_URLS[network];
}

export function isHistoricalBlockQuery(
  method: string,
  params: unknown
): boolean {
  // gas_price takes `[block_id]`. null means the tip; a height or hash is history.
  if (method === 'gas_price' && Array.isArray(params)) {
    return params[0] != null;
  }

  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return false;
  }

  const blockParams = params as Record<string, unknown>;
  const pinned = blockParams.block_id != null || blockParams.block_hash != null;
  if (!pinned) return false;

  // A pinned height is history. Finality ("final" / "optimistic") is the tip.
  return method === 'block' || method === 'query' || method === 'gas_price';
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
export function buildLavaUrl(
  apiKey: string | undefined,
  network: Network
): string | undefined {
  if (!apiKey) return undefined;
  return `${LAVA_GATEWAY_BASE[network]}/${apiKey}`;
}

export interface ResolveOptions {
  lavaApiKey?: string;
  fastnearApiKey?: string;
}

export function fastnearAuthorizationHeader(
  apiKey: string | undefined
): string | undefined {
  const key = apiKey?.trim();
  if (!key) return undefined;
  return `Bearer ${key}`;
}

export function isKeyedFastNearRpcUrl(url: string): boolean {
  try {
    const host = new URL(url).host;
    return (
      host === 'rpc.testnet.fastnear.com' || host === 'rpc.mainnet.fastnear.com'
    );
  } catch {
    return false;
  }
}

/**
 * Resolve primary RPC URL.
 * Priority: NEAR_RPC_URL → keyed FastNear → keyed Lava → public FastNear.
 * A missing FastNear key leaves Lava as the primary.
 */
export function resolveNearRpcUrl(
  network: Network = 'testnet',
  opts?: ResolveOptions
): string {
  if (typeof process !== 'undefined') {
    if (process.env?.NEAR_RPC_URL) return process.env.NEAR_RPC_URL;
    const fastnearKey = opts?.fastnearApiKey || process.env?.FASTNEAR_API_KEY;
    if (fastnearKey?.trim()) return KEYED_FASTNEAR_RPC_URLS[network];
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
  fastnearApiKey?: string;
  primaryUrl?: string;
}

/**
 * Standard primary URL for OnSocial services.
 * Server: NEAR_RPC_URL → keyed FastNear → Lava → public FastNear.
 * Browser (default): public FastNear only. The server key never reaches this path.
 */
export function resolveConfiguredNearRpcUrl(
  network: Network,
  opts?: ConfiguredNearRpcUrlOptions
): string {
  if (opts?.primaryUrl) return opts.primaryUrl;
  const publicOnly = opts?.publicOnly ?? isBrowserNearRpcContext();
  if (publicOnly) return FALLBACK_RPC_URLS[network];
  return resolveNearRpcUrl(network, {
    lavaApiKey: opts?.lavaApiKey,
    fastnearApiKey: opts?.fastnearApiKey,
  });
}

/** Host only, so a Lava key in the URL path never reaches a log line. */
export function rpcEndpointLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port && parsed.port !== '80' && parsed.port !== '443'
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;
  } catch {
    return 'rpc';
  }
}

export interface ConfiguredNearRpcOptions
  extends Omit<
    NearRpcConfig,
    | 'primaryUrl'
    | 'fallbackUrl'
    | 'network'
    | 'endpoints'
    | 'primaryAuthorization'
  > {
  network: Network;
  publicOnly?: boolean;
  lavaApiKey?: string;
  fastnearApiKey?: string;
  primaryUrl?: string;
  fallbackUrl?: string;
}

// --- Circuit breaker ---

interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
  openWindowMs: number;
  /** First endpoint to try while the circuit is open. */
  activeIndex: number;
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
  const endpoints: NearRpcEndpoint[] = config.endpoints?.length
    ? config.endpoints.map((endpoint) => ({
        url: endpoint.url,
        authorization: endpoint.authorization?.trim() || undefined,
      }))
    : [
        {
          url: primaryUrl,
          authorization: config.primaryAuthorization?.trim() || undefined,
        },
        ...(fallbackUrl !== primaryUrl ? [{ url: fallbackUrl }] : []),
      ];
  const circuit: CircuitState = {
    failures: 0,
    lastFailure: 0,
    open: false,
    openWindowMs: circuitBreakerWindowMs,
    activeIndex: 0,
  };

  function isCircuitOpen(): boolean {
    if (!circuit.open) return false;
    if (Date.now() - circuit.lastFailure > circuit.openWindowMs) {
      circuit.open = false;
      circuit.failures = 0;
      circuit.activeIndex = 0;
      onLog('info', 'Circuit breaker half-open, retrying primary', {
        provider: rpcEndpointLabel(endpoints[0].url),
      });
      return false;
    }
    return true;
  }

  function recordFailure(rateLimited = false, failedIndex = 0): void {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    const nextIndex = Math.min(failedIndex + 1, endpoints.length - 1);
    if (rateLimited) {
      circuit.failures = Math.max(circuit.failures, circuitBreakerThreshold);
      circuit.openWindowMs = RATE_LIMIT_WINDOW_MS;
    } else if (!circuit.open) {
      circuit.openWindowMs = circuitBreakerWindowMs;
    }
    if (circuit.failures >= circuitBreakerThreshold) {
      const opened = !circuit.open;
      circuit.open = true;
      circuit.activeIndex = nextIndex;
      if (opened) {
        onLog('warn', 'Circuit breaker opened — routing to fallback', {
          failures: circuit.failures,
          fallback: rpcEndpointLabel(endpoints[circuit.activeIndex].url),
          rateLimited,
        });
      }
    }
  }

  function recordSuccess(): void {
    if (circuit.failures > 0 || circuit.open || circuit.activeIndex !== 0) {
      circuit.failures = 0;
      circuit.open = false;
      circuit.activeIndex = 0;
    }
  }

  function rememberBackup(index: number): void {
    circuit.activeIndex = index;
    if (circuit.failures >= circuitBreakerThreshold) {
      circuit.open = true;
    }
  }

  function headersFor(endpoint: NearRpcEndpoint): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (endpoint.authorization) {
      headers.Authorization = endpoint.authorization;
    }
    return headers;
  }

  async function fetchWithTimeout(
    endpoint: NearRpcEndpoint,
    body: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(endpoint.url, {
        method: 'POST',
        headers: headersFor(endpoint),
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
    endpoint: NearRpcEndpoint,
    body: string,
    retries: number
  ): Promise<NearRpcResponse> {
    let lastError: Error | null = null;
    const label = rpcEndpointLabel(endpoint.url);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          const jitter = Math.random() * 50;
          const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
          await new Promise((r) => setTimeout(r, delay));
        }

        const res = await fetchWithTimeout(endpoint, body);
        if (res.status === 429) {
          throw new Error(`HTTP 429: rate limited by ${label}`);
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
              `RPC rate limit [${code}]: ${json.error.message || JSON.stringify(json.error)}`
            );
          }
          if (isRetryableRpcError(code)) {
            throw new Error(
              `RPC error [${code}]: ${json.error.message || JSON.stringify(json.error)}`
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
          onLog(
            'warn',
            `Attempt ${attempt + 1}/${retries + 1} failed, retrying`,
            {
              provider: label,
              error: lastError.message,
            }
          );
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
      onLog('info', 'Trying archival RPC for historical query', {
        archivalUrl,
      });
      const result = await tryProvider({ url: archivalUrl }, body, 1);
      if (result.error && isGarbageCollectedRpcError(result.error)) {
        return null;
      }
      return result as NearRpcResponse<T>;
    } catch {
      return null;
    }
  }

  function finishSuccess<T>(
    index: number,
    result: NearRpcResponse<T>
  ): NearRpcResponse<T> {
    if (index === 0) recordSuccess();
    else rememberBackup(index);
    return result;
  }

  return {
    async call<T = unknown>(
      method: string,
      params: unknown
    ): Promise<NearRpcResponse<T>> {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 'onsocial',
        method,
        params,
      });
      const historical = isHistoricalBlockQuery(method, params);
      const start = isCircuitOpen() ? circuit.activeIndex : 0;
      let lastError = 'unknown error';

      for (let index = start; index < endpoints.length; index++) {
        const endpoint = endpoints[index];
        try {
          const result = await tryProvider(endpoint, body, maxRetries);
          if (
            result.error &&
            historical &&
            isGarbageCollectedRpcError(result.error)
          ) {
            const archival = await tryArchivalHistoricalQuery<T>(
              method,
              params,
              body
            );
            if (archival?.result != null) {
              return finishSuccess(index, archival);
            }
          }
          if (result.error) {
            return result as NearRpcResponse<T>;
          }
          return finishSuccess(index, result as NearRpcResponse<T>);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = msg;
          recordFailure(/RPC rate limit|HTTP 429/i.test(msg), index);
          if (historical && isGarbageCollectedRpcMessage(msg)) {
            const archival = await tryArchivalHistoricalQuery<T>(
              method,
              params,
              body
            );
            if (archival?.result != null) {
              return finishSuccess(index, archival);
            }
          }
          if (index < endpoints.length - 1) {
            onLog('warn', 'RPC provider failed, trying the next one', {
              provider: rpcEndpointLabel(endpoint.url),
              next: rpcEndpointLabel(endpoints[index + 1].url),
              error: msg,
            });
            continue;
          }
          onLog('error', 'All RPC providers failed', {
            provider: rpcEndpointLabel(endpoint.url),
            error: msg,
          });
        }
      }

      throw new Error(
        `All NEAR RPC providers failed. Last error: ${lastError}`
      );
    },

    getActiveUrl(): string {
      const index = isCircuitOpen() ? circuit.activeIndex : 0;
      return endpoints[index]?.url ?? primaryUrl;
    },

    resetCircuit(): void {
      circuit.failures = 0;
      circuit.lastFailure = 0;
      circuit.open = false;
      circuit.activeIndex = 0;
      circuit.openWindowMs = circuitBreakerWindowMs;
    },
  };
}

export interface ConfiguredNearRpcProviderOptions {
  publicOnly?: boolean;
  primaryUrl?: string;
  fallbackUrl?: string;
  lavaApiKey?: string;
  fastnearApiKey?: string;
}

/**
 * Ordered server providers.
 * Private node, then keyed FastNear, then Lava, then public FastNear,
 * then the NEAR.org endpoint. A healthy call stops at the first success.
 * `publicOnly` is public FastNear, then NEAR.org, with no keys.
 */
export function resolveConfiguredNearRpcProviders(
  network: Network,
  options: ConfiguredNearRpcProviderOptions = {}
): NearRpcEndpoint[] {
  const endpoints: NearRpcEndpoint[] = [];
  const push = (url?: string, authorization?: string) => {
    const trimmed = url?.trim();
    if (!trimmed || endpoints.some((endpoint) => endpoint.url === trimmed)) {
      return;
    }
    const auth = authorization?.trim();
    endpoints.push(
      auth ? { url: trimmed, authorization: auth } : { url: trimmed }
    );
  };

  if (options.publicOnly) {
    push(FALLBACK_RPC_URLS[network]);
    push(NEAR_ORG_RPC_URLS[network]);
    return endpoints;
  }

  const fastnearKey = options.fastnearApiKey?.trim();
  const fastnearAuth = fastnearAuthorizationHeader(fastnearKey);
  const primary = resolveConfiguredNearRpcUrl(network, {
    publicOnly: false,
    primaryUrl: options.primaryUrl,
    lavaApiKey: options.lavaApiKey,
    fastnearApiKey: fastnearKey,
  });
  push(primary, isKeyedFastNearRpcUrl(primary) ? fastnearAuth : undefined);
  if (options.fallbackUrl && isKeyedFastNearRpcUrl(options.fallbackUrl)) {
    push(options.fallbackUrl, fastnearAuth);
  } else {
    push(options.fallbackUrl);
  }
  if (fastnearAuth) {
    push(KEYED_FASTNEAR_RPC_URLS[network], fastnearAuth);
  }
  push(buildLavaUrl(options.lavaApiKey, network));
  push(FALLBACK_RPC_URLS[network]);
  push(NEAR_ORG_RPC_URLS[network]);
  return endpoints;
}

/**
 * Create a NEAR RPC client with OnSocial defaults.
 * Server: private node, keyed FastNear, Lava, public FastNear, then NEAR.org.
 * Browser (`publicOnly`): public FastNear, then NEAR.org. No API keys.
 */
export function createConfiguredNearRpc(
  options: ConfiguredNearRpcOptions
): NearRpc {
  const {
    network,
    publicOnly,
    lavaApiKey,
    fastnearApiKey,
    primaryUrl,
    fallbackUrl,
    ...rest
  } = options;

  const resolvedPublicOnly = publicOnly ?? isBrowserNearRpcContext();
  const serverFastnearKey = resolvedPublicOnly
    ? undefined
    : fastnearApiKey ||
      (typeof process !== 'undefined'
        ? process.env?.FASTNEAR_API_KEY
        : undefined);
  const serverLavaKey = resolvedPublicOnly
    ? undefined
    : lavaApiKey ||
      (typeof process !== 'undefined' ? process.env?.LAVA_API_KEY : undefined);
  const endpoints = resolveConfiguredNearRpcProviders(network, {
    publicOnly: resolvedPublicOnly,
    primaryUrl: resolvedPublicOnly ? undefined : primaryUrl,
    fallbackUrl: resolvedPublicOnly ? undefined : fallbackUrl,
    lavaApiKey: serverLavaKey,
    fastnearApiKey: serverFastnearKey,
  });

  return createNearRpc({
    ...rest,
    network,
    primaryUrl: endpoints[0].url,
    endpoints,
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
export function createBffNearRpcClient(
  options: BffNearRpcClientOptions
): NearRpc {
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
  const response = await options
    .getRpc(network)
    .call(method, body.params ?? {});

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
    return Promise.all(
      body.map((entry) => handleNearJsonRpcRequest(entry, options))
    );
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
  const internalHeader =
    options.internalHeaderName ?? 'x-onsocial-internal-rpc';
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
