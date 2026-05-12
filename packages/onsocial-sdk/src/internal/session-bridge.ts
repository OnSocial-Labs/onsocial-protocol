// Compose-to-delegate relay helpers.

import type { HttpClient } from './http.js';
import type { Session } from '../advanced/session.js';
import type {
  BroadcastTarget,
  PrepareResponse,
  RelayResponse,
} from '../types.js';

/** Optional injected provider for the finality block-height. */
export type LatestBlockHeightProvider = () => Promise<bigint | number | string>;

/** Default per-call gas (300 TGas) when wallet mode does not specify one. */
const DEFAULT_FUNCTION_CALL_GAS = '300000000000000';

export class SessionRequiredError extends Error {
  readonly code = 'SESSION_REQUIRED' as const;
  constructor(method?: string) {
    super(
      method
        ? `OnSocial.${method} requires an attached session. Call os.attachSession(session) after onboarding.`
        : 'This SDK method requires an attached session. Call os.attachSession(session) after onboarding.'
    );
    this.name = 'SessionRequiredError';
  }
}

export type { PrepareResponse } from '../types.js';

/**
 * Runs the prepare -> sign -> relay pipeline for one compose verb.
 *
 * The HTTP `/compose/prepare/<verb>` call is always made against the gateway
 * (that is where action-building lives). Once the action is prepared, the
 * broadcast leg honors `opts.broadcast` exactly like `signAndRelay`:
 *   • `'gateway'` (default)  → POST `/relay/delegate` with a SignedDelegateAction
 *   • `{ kind: 'relayer' }`  → POST to an external relayer URL
 *   • `{ kind: 'wallet' }`   → user's wallet signs a regular FunctionCall
 *                              (no Session required for this branch)
 */
export async function composeAndSign(
  http: HttpClient,
  session: Session | null,
  verb: string,
  body: unknown,
  methodLabel?: string,
  opts?: {
    broadcast?: BroadcastTarget;
    wait?: boolean;
    methodName?: string;
  }
): Promise<RelayResponse> {
  const target = opts?.broadcast ?? 'gateway';
  const isWallet = typeof target === 'object' && target.kind === 'wallet';
  if (!session && !isWallet) {
    throw new SessionRequiredError(methodLabel);
  }

  const prepared = await http.post<PrepareResponse>(
    `/compose/prepare/${verb}`,
    body ?? {}
  );

  if (!prepared || typeof prepared !== 'object' || !prepared.action) {
    throw new Error(
      `Gateway /compose/prepare/${verb} did not return a valid action`
    );
  }

  return signAndRelay(
    http,
    session,
    prepared.action,
    prepared.target_account,
    methodLabel,
    opts
  );
}

/** Signs an already-built action and submits it via the configured broadcast target. */
export async function signAndRelay(
  http: HttpClient,
  session: Session | null,
  action: Record<string, unknown>,
  targetContract: string,
  methodLabel?: string,
  opts?: {
    targetAccount?: string;
    requestOptions?: Record<string, unknown>;
    wait?: boolean;
    broadcast?: BroadcastTarget;
    latestBlockHeightProvider?: LatestBlockHeightProvider;
    /** Inner FunctionCall method (`execute` or `execute_admin`). Default `execute`. */
    methodName?: string;
  }
): Promise<RelayResponse> {
  const target = opts?.broadcast ?? 'gateway';

  // Wallet mode: skip NEP-366 entirely, hand a regular FunctionCall to the
  // wallet (user pays gas). Does NOT require an attached Session.
  if (typeof target === 'object' && target.kind === 'wallet') {
    return broadcastViaWallet(action, targetContract, target, opts);
  }

  if (!session) {
    throw new SessionRequiredError(methodLabel);
  }
  return relayDelegate<RelayResponse>(
    http,
    session,
    action,
    targetContract,
    opts
  );
}

export interface FormPrepareResult<T = RelayResponse> {
  relay: T;
  media?: { cid: string; url: string; size: number; hash: string };
  metadata?: { cid: string; url: string; size: number; hash: string };
}

/**
 * Multipart variant of `composeAndSign`. Same broadcast routing rules:
 * the gateway always builds the action, then `signAndRelay` dispatches
 * to gateway / external relayer / wallet per `opts.broadcast`.
 */
export async function composeFormAndSign<T = RelayResponse>(
  http: HttpClient,
  session: Session | null,
  verb: string,
  form: FormData,
  methodLabel?: string,
  opts?: {
    broadcast?: BroadcastTarget;
    wait?: boolean;
    methodName?: string;
  }
): Promise<FormPrepareResult<T>> {
  const target = opts?.broadcast ?? 'gateway';
  const isWallet = typeof target === 'object' && target.kind === 'wallet';
  if (!session && !isWallet) {
    throw new SessionRequiredError(methodLabel);
  }

  const prepared = await http.requestForm<
    PrepareResponse & {
      media?: { cid: string; url: string; size: number; hash: string };
      metadata?: { cid: string; url: string; size: number; hash: string };
    }
  >('POST', `/compose/prepare/${verb}`, form);

  if (!prepared || typeof prepared !== 'object' || !prepared.action) {
    throw new Error(
      `Gateway /compose/prepare/${verb} did not return a valid action`
    );
  }

  const relay = (await signAndRelay(
    http,
    session,
    prepared.action,
    prepared.target_account,
    methodLabel,
    opts
  )) as unknown as T;

  return {
    relay,
    ...(prepared.media && { media: prepared.media }),
    ...(prepared.metadata && { metadata: prepared.metadata }),
  };
}

export type SessionGetter = () => Session | null;

/**
 * Returns the broadcast target the host client wants to use, or `undefined`
 * to fall back to the bridge default (`'gateway'`). Wired by `OnSocial`
 * from its `defaultBroadcast` config so convenience modules can honor the
 * caller's preference (e.g. `'wallet'` for power users / admin flows).
 */
export type BroadcastGetter = () => BroadcastTarget | undefined;

let __latestBlockCache: { height: bigint; fetchedAtMs: number } | null = null;
const LATEST_BLOCK_TTL_MS = 5_000;

/** @internal Test-only: clear the cached latest block height. */
export function __resetLatestBlockCache(): void {
  __latestBlockCache = null;
}

/** Fetches the finalized block height (from the gateway, or an injected provider). */
async function getLatestBlockHeight(
  http: HttpClient,
  provider?: LatestBlockHeightProvider
): Promise<bigint> {
  const now = Date.now();
  if (
    __latestBlockCache &&
    now - __latestBlockCache.fetchedAtMs < LATEST_BLOCK_TTL_MS
  ) {
    return __latestBlockCache.height;
  }
  let height: bigint;
  if (provider) {
    height = BigInt(await provider());
  } else {
    const resp = await http.get<{ block_height: number | string }>(
      '/relay/latest-block'
    );
    height = BigInt(resp.block_height);
  }
  __latestBlockCache = { height, fetchedAtMs: now };
  return height;
}

const DELEGATE_BLOCK_TTL = 1000n;

async function relayDelegate<T>(
  http: HttpClient,
  session: Session,
  action: Record<string, unknown>,
  targetContract: string,
  opts?: {
    targetAccount?: string;
    requestOptions?: Record<string, unknown>;
    wait?: boolean;
    broadcast?: BroadcastTarget;
    latestBlockHeightProvider?: LatestBlockHeightProvider;
    methodName?: string;
  }
): Promise<T> {
  const latest = await getLatestBlockHeight(
    http,
    opts?.latestBlockHeightProvider
  );
  const { base64 } = await session.signComposeDelegate({
    action,
    targetContract,
    maxBlockHeight: latest + DELEGATE_BLOCK_TTL,
    ...(opts?.targetAccount !== undefined && {
      targetAccount: opts.targetAccount,
    }),
    ...(opts?.requestOptions !== undefined && {
      requestOptions: opts.requestOptions,
    }),
    ...(opts?.methodName !== undefined && { methodName: opts.methodName }),
  });

  const target: BroadcastTarget = opts?.broadcast ?? 'gateway';
  const payload = { signed_delegate: base64 };

  if (target === 'gateway') {
    const path = opts?.wait ? '/relay/delegate?wait=true' : '/relay/delegate';
    return http.post<T>(path, payload);
  }

  if (target.kind !== 'relayer') {
    throw new Error(
      `relayDelegate cannot broadcast via "${target.kind}" — route through signAndRelay`
    );
  }

  const url = appendWait(target.url, opts?.wait === true);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (target.apiKey) headers['X-Api-Key'] = target.apiKey;
  if (target.headers) Object.assign(headers, target.headers);

  const fetchImpl = globalThis.fetch;
  const resp = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = (await resp.json().catch(() => ({}))) as T;
  if (!resp.ok) {
    throw new Error(
      `External relayer ${target.url} returned ${resp.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

function appendWait(url: string, wait: boolean): string {
  if (!wait) return url;
  return url.includes('?') ? `${url}&wait=true` : `${url}?wait=true`;
}

async function broadcastViaWallet(
  action: Record<string, unknown>,
  targetContract: string,
  target: Extract<BroadcastTarget, { kind: 'wallet' }>,
  opts?: {
    targetAccount?: string;
    requestOptions?: Record<string, unknown>;
    methodName?: string;
  }
): Promise<RelayResponse> {
  const request: Record<string, unknown> = { action };
  if (opts?.targetAccount !== undefined) {
    request.target_account = opts.targetAccount;
  }
  if (opts?.requestOptions !== undefined) {
    request.options = opts.requestOptions;
  }

  const result = await target.signer({
    receiverId: targetContract,
    actions: [
      {
        type: 'FunctionCall',
        methodName: opts?.methodName ?? 'execute',
        args: { request },
        gas: String(target.gas ?? DEFAULT_FUNCTION_CALL_GAS),
        deposit: String(target.deposit ?? '0'),
      },
    ],
  });

  const txHash =
    result?.txHash ??
    (typeof result?.transaction === 'object'
      ? result.transaction?.hash
      : undefined);
  return {
    ...(txHash !== undefined && { txHash }),
    ok: true,
    raw: result,
  };
}
