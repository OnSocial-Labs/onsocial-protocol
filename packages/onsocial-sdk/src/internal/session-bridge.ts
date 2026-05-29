// Compose-to-delegate relay helpers.

import type { HttpClient } from './http.js';
import {
  NeedsWalletConfirmationError,
  type Session,
} from '../advanced/session.js';
import type {
  BroadcastTarget,
  Network,
  PrepareResponse,
  RelayResponse,
} from '../types.js';
import {
  isDelegateNonceError,
  resyncSessionDelegateNonce,
  runSerializedSessionRelay,
  type AccessKeyNonceProvider,
} from './session-relay.js';

/** Optional injected provider for the finality block-height. */
export type LatestBlockHeightProvider = () => Promise<bigint | number | string>;

/** Default per-call gas (300 TGas) when wallet mode does not specify one. */
const DEFAULT_FUNCTION_CALL_GAS = '300000000000000';
const GATEWAY_MAX_DELEGATE_DEPOSIT_YOCTO = 1n;

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
 * broadcast leg defaults to the canonical OnAPI lane:
 *   • `'gateway'` (default)  → POST `/relay/delegate` with a SignedDelegateAction
 *   • `{ kind: 'relayer' }`  → advanced/self-hosted direct relayer URL
 *   • `{ kind: 'wallet' }`   → explicit wallet-paid/admin FunctionCall
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
    depositYocto?: bigint | string;
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
    mergePreparedOptions(opts, prepared, http.network)
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
    accessKeyNonceProvider?: AccessKeyNonceProvider;
    network?: Network;
    /** Inner FunctionCall method (`execute` or `execute_admin`). Default `execute`. */
    methodName?: string;
    /** Inner FunctionCall attached deposit in yoctoNEAR. */
    depositYocto?: bigint | string;
  }
): Promise<RelayResponse> {
  const target = opts?.broadcast ?? 'gateway';

  // Advanced wallet mode skips NEP-366 entirely and hands a regular
  // FunctionCall to the wallet. The user pays gas and no Session is required.
  if (typeof target === 'object' && target.kind === 'wallet') {
    return broadcastViaWallet(action, targetContract, target, opts);
  }

  if (!session) {
    throw new SessionRequiredError(methodLabel);
  }
  assertDelegateBroadcastSupported(session, target, opts, methodLabel);
  return relayDelegate<RelayResponse>(http, session, action, targetContract, {
    ...opts,
    network: opts?.network ?? http.network,
  });
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
    depositYocto?: bigint | string;
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
    mergePreparedOptions(opts, prepared, http.network)
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

export { __resetSessionRelayQueues } from './session-relay.js';

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
    accessKeyNonceProvider?: AccessKeyNonceProvider;
    network?: Network;
    methodName?: string;
    depositYocto?: bigint | string;
  }
): Promise<T> {
  return runSerializedSessionRelay(session, () =>
    relayDelegateOnce<T>(http, session, action, targetContract, opts)
  );
}

async function relayDelegateOnce<T>(
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
    accessKeyNonceProvider?: AccessKeyNonceProvider;
    network?: Network;
    methodName?: string;
    depositYocto?: bigint | string;
  }
): Promise<T> {
  let retried = false;

  while (true) {
    try {
      const latest = await getLatestBlockHeight(
        http,
        opts?.latestBlockHeightProvider
      );
      session.ensureNonceAboveAccessKeyFloor?.(latest);
      const { base64, nonce } = await session.signComposeDelegate({
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
        ...(opts?.depositYocto !== undefined && {
          depositYocto: opts.depositYocto,
        }),
      });

      const result = await postSignedDelegate<T>(http, base64, opts);
      await session.persistRelayNonce?.(nonce);
      return result;
    } catch (error) {
      if (!retried && isDelegateNonceError(error)) {
        retried = true;
        await resyncSessionDelegateNonce(session, error, {
          network: opts?.network ?? session.network,
          accessKeyNonceProvider: opts?.accessKeyNonceProvider,
        });
        continue;
      }
      throw error;
    }
  }
}

async function postSignedDelegate<T>(
  http: HttpClient,
  base64: string,
  opts?: {
    wait?: boolean;
    broadcast?: BroadcastTarget;
  }
): Promise<T> {
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

function assertDelegateBroadcastSupported(
  session: Session,
  target: BroadcastTarget,
  opts:
    | {
        depositYocto?: bigint | string;
      }
    | undefined,
  methodLabel?: string
): void {
  const deposit = normalizeDepositYocto(opts?.depositYocto);
  if (deposit === 0n) return;

  const label = methodLabel ?? 'this SDK method';
  if (target === 'gateway' && deposit > GATEWAY_MAX_DELEGATE_DEPOSIT_YOCTO) {
    throw new NeedsWalletConfirmationError(
      `${label} requires an attached deposit of ${deposit.toString()} yoctoNEAR. ` +
        `The OnSocial gateway relayer only accepts 0-deposit calls and 1 yoctoNEAR confirmation deposits; ` +
        `use { broadcast: { kind: 'wallet', signer } } or fund the contract prepaid balance for value-bearing scarces actions.`,
      'value_deposit_required'
    );
  }

  if (!session.supportsAttachedDeposit) {
    const depositKind =
      deposit === 1n
        ? 'a 1 yoctoNEAR confirmation deposit'
        : `an attached deposit of ${deposit.toString()} yoctoNEAR`;
    throw new NeedsWalletConfirmationError(
      `${label} requires ${depositKind}. NEAR FunctionCall session keys cannot attach NEAR; ` +
        `use wallet broadcast or a FullAccess-capable delegate signer.`,
      deposit === 1n ? 'attached_deposit_required' : 'value_deposit_required'
    );
  }
}

function normalizeDepositYocto(value: bigint | string | undefined): bigint {
  if (value === undefined) return 0n;
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('attached deposit cannot be negative');
    return value;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid attached deposit: ${value}`);
  }
  return BigInt(trimmed);
}

async function broadcastViaWallet(
  action: Record<string, unknown>,
  targetContract: string,
  target: Extract<BroadcastTarget, { kind: 'wallet' }>,
  opts?: {
    targetAccount?: string;
    requestOptions?: Record<string, unknown>;
    methodName?: string;
    depositYocto?: bigint | string;
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
        deposit: String(target.deposit ?? opts?.depositYocto ?? '0'),
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

function mergePreparedOptions<T extends { depositYocto?: bigint | string }>(
  opts: T | undefined,
  prepared: PrepareResponse,
  network: Network
): T & { network: Network } {
  const depositYocto =
    opts?.depositYocto !== undefined
      ? opts.depositYocto
      : preparedDepositYocto(prepared);
  return {
    ...(opts ?? ({} as T)),
    network,
    ...(depositYocto !== undefined ? { depositYocto } : {}),
  } as T & { network: Network };
}

function preparedDepositYocto(prepared: PrepareResponse): string | undefined {
  const record = prepared as Record<string, unknown>;
  return (
    parseYocto(record.deposit_yocto) ??
    parseYocto(record.depositYocto) ??
    parseYocto(record.attached_deposit_yocto) ??
    parseYocto(record.attachedDepositYocto)
  );
}

function parseYocto(value: unknown): string | undefined {
  if (typeof value === 'bigint' && value >= 0n) return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : undefined;
}
