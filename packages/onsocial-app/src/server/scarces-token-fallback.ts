import 'server-only';

import {
  createConfiguredNearRpc,
  rpcEndpointLabel,
  type NearRpc,
  type NearRpcResponse,
} from '@onsocial/rpc';

import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

/**
 * Short gateway budget for this one read. Matches the gateway chain probe
 * (`AbortSignal.timeout(3_000)` in the live-health probe) so a dead gateway
 * fails over before a feed card sits on it.
 */
export const SCARCES_TOKEN_GATEWAY_TIMEOUT_MS = 3_000;

/** Same chain-read budget as the server RPC client in `near-rpc-bff`. */
export const SCARCES_TOKEN_RPC_TIMEOUT_MS = 8_000;

/**
 * The gateway attempt already failed, so each chain provider is tried once.
 * `@onsocial/rpc` still walks the configured provider list.
 */
export const SCARCES_TOKEN_RPC_MAX_RETRIES = 0;
export const SCARCES_TOKEN_RPC_BASE_DELAY_MS = 0;

/**
 * Same trip threshold and window as `@onsocial/rpc`'s circuit breaker
 * (`circuitBreakerThreshold` 5, `circuitBreakerWindowMs` 30_000).
 */
export const SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD = 5;
export const SCARCES_TOKEN_GATEWAY_COOL_OFF_MS = 30_000;

const FALLBACK_LOG_SIGNATURE = 'SCARCES_TOKEN_GATEWAY_FALLBACK';
const MESSAGE_LIMIT = 160;

export type ScarcesTokenFallbackReason =
  | 'timeout'
  | 'http'
  | 'network'
  | 'cool_off';

export type ScarcesTokenReadOutcome = 'served' | 'empty' | 'failed';

type ChainReadFailure =
  | 'unknown_token'
  | 'unknown_account'
  | 'timeout'
  | 'rpc_error';

interface CallFunctionResult {
  result?: number[] | string;
  error?: string;
}

export interface ScarcesTokenUpstreamSnapshot {
  status: number;
  body: string;
  contentType: string | null;
}

export type ScarcesTokenFallbackResult =
  | { kind: 'json'; status: number; body: string }
  | {
      kind: 'upstream';
      status: number;
      body: string;
      contentType: string | null;
    };

let consecutiveGatewayFailures = 0;
let coolOffUntil = 0;
let nowOverride: (() => number) | null = null;
let rpcClient: NearRpc | null = null;
let rpcCacheKey = '';

function now(): number {
  return nowOverride ? nowOverride() : Date.now();
}

function trimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function serverRpcSettings(): {
  keyed: boolean;
  fastnearApiKey?: string;
  lavaApiKey?: string;
  nearRpcUrl?: string;
} {
  const fastnearApiKey = trimmedEnv('FASTNEAR_API_KEY');
  const lavaApiKey = trimmedEnv('LAVA_API_KEY');
  const nearRpcUrl = trimmedEnv('NEAR_RPC_URL');
  return {
    keyed: Boolean(fastnearApiKey || lavaApiKey || nearRpcUrl),
    fastnearApiKey,
    lavaApiKey,
    nearRpcUrl,
  };
}

function scarcesContractId(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';
}

export function isScarcesTokenRead(
  method: string,
  pathSegments: string[]
): boolean {
  return method === 'GET' && pathSegments.join('/') === 'data/scarces-token';
}

/** Token-not-found and request 4xx stay on the gateway response. */
export function shouldFallbackScarcesTokenGateway(
  status: number,
  body: string
): boolean {
  if (isTokenNotFound(status, body)) return false;
  if (status >= 400 && status < 500) return false;
  return status >= 500;
}

function isTokenNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  return /token not found/i.test(body);
}

export function isScarcesTokenGatewayTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name =
    'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : '';
  return /timeout/i.test(message);
}

export function scarcesTokenGatewayCoolingOff(at = now()): boolean {
  return at < coolOffUntil;
}

export function noteScarcesTokenGatewaySuccess(): void {
  consecutiveGatewayFailures = 0;
  coolOffUntil = 0;
}

export function noteScarcesTokenGatewayFailure(at = now()): void {
  consecutiveGatewayFailures += 1;
  if (consecutiveGatewayFailures >= SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD) {
    coolOffUntil = at + SCARCES_TOKEN_GATEWAY_COOL_OFF_MS;
    consecutiveGatewayFailures = 0;
  }
}

function getScarcesTokenRpc(): { client: NearRpc; keyed: boolean } {
  const settings = serverRpcSettings();
  const cacheKey = [
    settings.keyed ? '1' : '0',
    settings.fastnearApiKey ?? '',
    settings.lavaApiKey ?? '',
    settings.nearRpcUrl ?? '',
    ACTIVE_NEAR_NETWORK,
  ].join('\n');
  if (!rpcClient || rpcCacheKey !== cacheKey) {
    rpcClient = createConfiguredNearRpc({
      network: ACTIVE_NEAR_NETWORK,
      publicOnly: !settings.keyed,
      primaryUrl: settings.keyed ? settings.nearRpcUrl : undefined,
      fastnearApiKey: settings.keyed ? settings.fastnearApiKey : undefined,
      lavaApiKey: settings.keyed ? settings.lavaApiKey : undefined,
      timeoutMs: SCARCES_TOKEN_RPC_TIMEOUT_MS,
      maxRetries: SCARCES_TOKEN_RPC_MAX_RETRIES,
      baseDelayMs: SCARCES_TOKEN_RPC_BASE_DELAY_MS,
    });
    rpcCacheKey = cacheKey;
  }
  return { client: rpcClient, keyed: settings.keyed };
}

function decodeViewBytes(result: number[] | string | undefined): Uint8Array {
  if (typeof result === 'string') {
    if (!result) return new Uint8Array();
    return new Uint8Array(Buffer.from(result, 'base64'));
  }
  if (!result?.length) return new Uint8Array();
  return Uint8Array.from(result);
}

/** One `nft_token` view. The args are a single token id, not a collection scan. */
function decodeNftToken(raw: CallFunctionResult | undefined): unknown {
  if (!raw) {
    throw new Error('nft_token returned no result');
  }
  if (typeof raw.error === 'string' && raw.error.trim()) {
    throw new Error(raw.error);
  }
  const bytes = decodeViewBytes(raw.result);
  if (!bytes.length) {
    throw new Error('nft_token returned no result bytes');
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function errorText(error: NonNullable<NearRpcResponse['error']>): string {
  const cause = error.cause?.name ?? '';
  const data = typeof error.data === 'string' ? error.data : '';
  return `${error.message ?? ''} ${data} ${cause}`;
}

function classifyRpcError(
  error: NonNullable<NearRpcResponse['error']>
): ChainReadFailure {
  const cause = error.cause?.name ?? '';
  const text = errorText(error);
  if (/token not found/i.test(text)) return 'unknown_token';
  if (
    cause === 'UNKNOWN_ACCOUNT' ||
    /does not exist|unknown account|account not found|unknown contract|contract not found/i.test(
      text
    )
  ) {
    return 'unknown_account';
  }
  if (cause === 'TIMEOUT' || /timeout|timed out/i.test(text)) return 'timeout';
  return 'rpc_error';
}

function classifyThrown(error: unknown): ChainReadFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/token not found/i.test(message)) return 'unknown_token';
  if (
    /does not exist|unknown account|account not found|unknown contract|contract not found/i.test(
      message
    )
  ) {
    return 'unknown_account';
  }
  if (
    isScarcesTokenGatewayTimeout(error) ||
    /timeout|timed out/i.test(message)
  ) {
    return 'timeout';
  }
  return 'rpc_error';
}

function redactSecrets(message: string): string {
  let redacted = message
    .replace(
      /([?&](?:api[-_]?key|key|access[-_]?token)=)[^&\s]+/gi,
      '$1[redacted]'
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]');
  for (const name of ['FASTNEAR_API_KEY', 'LAVA_API_KEY', 'ONSOCIAL_API_KEY']) {
    const secret = trimmedEnv(name);
    if (secret && secret.length >= 6) {
      redacted = redacted.split(secret).join('[redacted]');
    }
  }
  return redacted.slice(0, MESSAGE_LIMIT);
}

function failureDetail(failure: ChainReadFailure): string {
  if (failure === 'timeout') return 'chain read timed out';
  if (failure === 'unknown_account') {
    return 'scarces contract account is not on this network';
  }
  return 'chain read failed';
}

function unreachableBody(failure: ChainReadFailure): string {
  return JSON.stringify({
    error: 'OnSocial gateway unreachable',
    detail: failureDetail(failure),
  });
}

function logFallback(input: {
  reason: ScarcesTokenFallbackReason;
  keyed: boolean;
  provider: string;
  outcome: ScarcesTokenReadOutcome;
  failure?: ChainReadFailure;
  detail?: string;
}): void {
  const payload: Record<string, unknown> = {
    reason: input.reason,
    keyed: input.keyed,
    unkeyedPublicRpc: !input.keyed,
    provider: rpcEndpointLabel(input.provider || 'rpc'),
    outcome: input.outcome,
  };
  if (!input.keyed) {
    payload.message = 'public rpc without a server rpc key';
  }
  if (input.outcome === 'failed' && input.failure) {
    payload.failure = input.failure;
  }
  if (input.outcome === 'failed' && input.detail) {
    payload.detail = input.detail;
  }
  console.warn(`${FALLBACK_LOG_SIGNATURE} ${JSON.stringify(payload)}`);
}

function settleFailure(
  upstream: ScarcesTokenUpstreamSnapshot | undefined,
  failure: ChainReadFailure
): {
  result: ScarcesTokenFallbackResult;
  outcome: ScarcesTokenReadOutcome;
  failure?: ChainReadFailure;
} {
  if (failure === 'unknown_token') {
    return {
      result: { kind: 'json', status: 200, body: 'null' },
      outcome: 'empty',
    };
  }
  if (upstream) {
    return {
      result: { kind: 'upstream', ...upstream },
      outcome: 'failed',
      failure,
    };
  }
  return {
    result: { kind: 'json', status: 502, body: unreachableBody(failure) },
    outcome: 'failed',
    failure,
  };
}

/**
 * Same `nft_token` read the gateway serves for `GET /data/scarces-token`.
 * One log line per call. RPC keys stay in server env and request headers.
 */
export async function readScarcesTokenFallback(input: {
  tokenId: string;
  reason: ScarcesTokenFallbackReason;
  upstream?: ScarcesTokenUpstreamSnapshot;
}): Promise<ScarcesTokenFallbackResult> {
  const { client, keyed } = getScarcesTokenRpc();
  let outcome: ScarcesTokenReadOutcome = 'failed';
  let failure: ChainReadFailure | undefined = 'rpc_error';
  let detail: string | undefined;
  let provider = '';
  let result: ScarcesTokenFallbackResult = settleFailure(
    input.upstream,
    'rpc_error'
  ).result;

  try {
    provider = client.getActiveUrl();
    const response = await client.call<CallFunctionResult>('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: scarcesContractId(),
      method_name: 'nft_token',
      args_base64: Buffer.from(
        JSON.stringify({ token_id: input.tokenId }),
        'utf8'
      ).toString('base64'),
    });
    provider = client.getActiveUrl() || provider;
    if (response.error) {
      const settled = settleFailure(
        input.upstream,
        classifyRpcError(response.error)
      );
      outcome = settled.outcome;
      failure = settled.failure;
      detail = redactSecrets(errorText(response.error));
      result = settled.result;
      return result;
    }
    const token = decodeNftToken(response.result);
    if (token === null) {
      outcome = 'empty';
      failure = undefined;
      detail = undefined;
      result = { kind: 'json', status: 200, body: 'null' };
      return result;
    }
    outcome = 'served';
    failure = undefined;
    detail = undefined;
    result = { kind: 'json', status: 200, body: JSON.stringify(token) };
    return result;
  } catch (error) {
    provider = safeActiveUrl(client) || provider;
    const settled = settleFailure(input.upstream, classifyThrown(error));
    outcome = settled.outcome;
    failure = settled.failure;
    detail = redactSecrets(
      error instanceof Error ? error.message : String(error)
    );
    result = settled.result;
    return result;
  } finally {
    logFallback({
      reason: input.reason,
      keyed,
      provider,
      outcome,
      failure,
      detail,
    });
  }
}

function safeActiveUrl(client: NearRpc): string {
  try {
    return client.getActiveUrl();
  } catch {
    return '';
  }
}

/** Test-only: control the cool-off clock and drop the cached chain client. */
export function __scarcesTokenFallbackTestHooks() {
  return {
    setNow(next: () => number) {
      nowOverride = next;
    },
    reset() {
      consecutiveGatewayFailures = 0;
      coolOffUntil = 0;
      nowOverride = null;
      rpcClient = null;
      rpcCacheKey = '';
    },
  };
}
