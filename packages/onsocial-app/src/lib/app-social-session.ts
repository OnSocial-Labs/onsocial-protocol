import type { NearConnector_ConnectOptions } from '@hot-labs/near-connect';
import {
  bootstrapSession,
  generateEd25519Key,
  localStorageKeyStore,
  nearConnectAdapter,
  persistSessionFromKey,
  resolveContractId,
  restoreEd25519Key,
  restoreSession,
  revokeSession,
  sessionId,
  type FunctionCallKeyLimits,
  type GeneratedSessionKey,
  type Session,
  type StoredSession,
} from '@onsocial/sdk/advanced';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { viewFunctionCallAccessKey } from '@/lib/near-access-key';

export const APP_SOCIAL_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const FUNCTION_CALL_KEY_ALLOWANCE_YOCTO = '250000000000000000000000';
const SESSION_KEY_ON_CHAIN_POLL_MS = 500;
const SESSION_KEY_ON_CHAIN_TIMEOUT_MS = 15_000;
const PENDING_SESSION_KEY_PREFIX = 'onsocial.app.session.pending.';

export type AppSocialSessionLifecycle = 'active' | 'expired' | 'missing';

export interface AppSessionPlan {
  sessionReady: boolean;
  pendingSessionKey?: GeneratedSessionKey;
}

interface StoredPendingSessionKey {
  publicKey: string;
  secretSeedB64u: string;
}

export function getAppSocialSessionPath(accountId: string): string {
  return `${accountId}/`;
}

export function getAppSocialSessionStore() {
  return localStorageKeyStore('onsocial.app.session.');
}

function appSessionStorageId(accountId: string): string {
  return sessionId(accountId, 'core', getAppSocialSessionPath(accountId));
}

function pendingSessionStorageKey(accountId: string): string {
  return `${PENDING_SESSION_KEY_PREFIX}${accountId}`;
}

function appSessionFunctionCallKey(
  allowanceYocto: string | null = FUNCTION_CALL_KEY_ALLOWANCE_YOCTO
): FunctionCallKeyLimits {
  return {
    methodNames: ['execute'],
    allowanceYocto,
  };
}

function appSessionBootstrapInput(
  accountId: string,
  functionCallKey?: FunctionCallKeyLimits
) {
  return {
    accountId,
    network: ACTIVE_NEAR_NETWORK,
    contract: 'core' as const,
    path: getAppSocialSessionPath(accountId),
    ttlMs: APP_SOCIAL_SESSION_TTL_MS,
    functionCallKey: functionCallKey ?? appSessionFunctionCallKey(),
    storageDepositYocto: '0',
    store: getAppSocialSessionStore(),
  };
}

function coreContractIdForNetwork(): string | undefined {
  return resolveContractId(ACTIVE_NEAR_NETWORK, 'core');
}

function buildAddKeyConnectOptions(
  pendingSessionKey: GeneratedSessionKey
): NearConnector_ConnectOptions | null {
  const coreContractId = coreContractIdForNetwork();
  if (!coreContractId) {
    return null;
  }

  return {
    addFunctionCallKey: {
      contractId: coreContractId,
      publicKey: pendingSessionKey.publicKey,
      allowMethods: { anyMethod: false, methodNames: ['execute'] },
    },
  };
}

async function hydrateGeneratedSessionKey(
  stored: StoredPendingSessionKey
): Promise<GeneratedSessionKey> {
  const restored = await restoreEd25519Key(
    stored.secretSeedB64u,
    stored.publicKey
  );
  return {
    publicKey: restored.publicKey,
    secretSeedB64u: stored.secretSeedB64u,
    sign: restored.sign,
  };
}

function readStoredPendingSessionKey(
  accountId: string
): StoredPendingSessionKey | null {
  try {
    const raw = window.localStorage.getItem(pendingSessionStorageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPendingSessionKey>;
    if (
      typeof parsed.publicKey === 'string' &&
      typeof parsed.secretSeedB64u === 'string'
    ) {
      return {
        publicKey: parsed.publicKey,
        secretSeedB64u: parsed.secretSeedB64u,
      };
    }
  } catch {
    // ignore corrupt pending key
  }
  return null;
}

function writeStoredPendingSessionKey(
  accountId: string,
  key: Pick<GeneratedSessionKey, 'publicKey' | 'secretSeedB64u'>
): void {
  try {
    window.localStorage.setItem(
      pendingSessionStorageKey(accountId),
      JSON.stringify({
        publicKey: key.publicKey,
        secretSeedB64u: key.secretSeedB64u,
      } satisfies StoredPendingSessionKey)
    );
  } catch {
    // ignore quota / private mode
  }
}

function clearStoredPendingSessionKey(accountId: string): void {
  try {
    window.localStorage.removeItem(pendingSessionStorageKey(accountId));
  } catch {
    // ignore
  }
}

/** Same pending key across resume attempts so AddKey can complete. */
export async function loadOrCreatePendingSessionKey(
  accountId: string
): Promise<GeneratedSessionKey> {
  const stored = readStoredPendingSessionKey(accountId);
  if (stored) {
    try {
      return await hydrateGeneratedSessionKey(stored);
    } catch {
      clearStoredPendingSessionKey(accountId);
    }
  }

  const generated = await generateEd25519Key();
  writeStoredPendingSessionKey(accountId, generated);
  return generated;
}

async function resolveOnChainSessionAllowanceYocto(
  accountId: string,
  publicKey: string
): Promise<string | null> {
  const coreContractId = coreContractIdForNetwork();
  if (!coreContractId) {
    return FUNCTION_CALL_KEY_ALLOWANCE_YOCTO;
  }

  const onChain = await viewFunctionCallAccessKey(accountId, publicKey);
  if (!onChain || onChain.receiverId !== coreContractId) {
    return null;
  }

  return onChain.allowanceYocto ?? FUNCTION_CALL_KEY_ALLOWANCE_YOCTO;
}

async function sessionKeyValidOnChain(
  accountId: string,
  publicKey: string
): Promise<boolean> {
  const allowance = await resolveOnChainSessionAllowanceYocto(
    accountId,
    publicKey
  );
  return allowance !== null;
}

async function waitForSessionKeyOnChain(
  accountId: string,
  publicKey: string,
  timeoutMs = SESSION_KEY_ON_CHAIN_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await sessionKeyValidOnChain(accountId, publicKey)) {
      return true;
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, SESSION_KEY_ON_CHAIN_POLL_MS);
    });
  }
  return sessionKeyValidOnChain(accountId, publicKey);
}

async function peekStoredAppSocialSession(
  accountId: string
): Promise<StoredSession | null> {
  return getAppSocialSessionStore().get(appSessionStorageId(accountId));
}

/** Pure classifier for local session metadata (no RPC). */
export function classifyStoredSessionLifecycle(
  stored: Pick<StoredSession, 'expiresAtMs'> | null | undefined,
  nowMs = Date.now()
): AppSocialSessionLifecycle {
  if (!stored) return 'missing';
  if (stored.expiresAtMs != null && stored.expiresAtMs < nowMs) {
    return 'expired';
  }
  return 'active';
}

/**
 * Local + on-chain lifecycle. Expired keeps the secret so renew can reuse the
 * same FunctionCall key instead of minting an orphan replacement.
 */
export async function getAppSocialSessionLifecycle(
  accountId: string,
  nowMs = Date.now()
): Promise<AppSocialSessionLifecycle> {
  const stored = await peekStoredAppSocialSession(accountId);
  const local = classifyStoredSessionLifecycle(stored, nowMs);
  if (local === 'missing' || !stored) return 'missing';

  let onChain = false;
  try {
    onChain = await sessionKeyValidOnChain(accountId, stored.publicKey);
  } catch (error) {
    console.warn('OnSocial session key check failed', error);
    throw error;
  }

  if (!onChain) {
    // Key gone from the account — drop stale local material.
    await clearAppSocialSession(accountId);
    return 'missing';
  }

  return local;
}

export async function restoreAppSocialSession(
  accountId: string
): Promise<Session | null> {
  const stored = await peekStoredAppSocialSession(accountId);
  if (!stored) {
    return null;
  }

  // Keep the secret when the 90-day local TTL lapses — renew reuses this key.
  if (classifyStoredSessionLifecycle(stored) === 'expired') {
    return null;
  }

  let remainingAllowanceYocto: string | null;
  try {
    remainingAllowanceYocto = await resolveOnChainSessionAllowanceYocto(
      accountId,
      stored.publicKey
    );
  } catch (error) {
    // Transient RPC failures must not wipe a valid local session.
    console.warn('OnSocial session key check failed', error);
    throw error;
  }

  if (remainingAllowanceYocto === null) {
    await clearAppSocialSession(accountId);
    return null;
  }

  return restoreSession({
    store: getAppSocialSessionStore(),
    accountId,
    contract: 'core',
    path: getAppSocialSessionPath(accountId),
    startingNonce: Date.now(),
    remainingAllowanceYocto,
  });
}

export async function clearAppSocialSession(accountId: string): Promise<void> {
  await getAppSocialSessionStore().delete(appSessionStorageId(accountId));
}

/** Local session public key when metadata is present (including expired). */
export async function getAppSocialSessionPublicKey(
  accountId: string
): Promise<string | null> {
  const stored = await peekStoredAppSocialSession(accountId);
  return stored?.publicKey ?? null;
}

/**
 * Delete the OnSocial FunctionCall session key on-chain and clear local
 * session metadata. Caller clears gateway JWT / React session flags.
 */
export async function revokeAppSocialSession(input: {
  accountId: string;
  wallet: NearWalletBase;
}): Promise<string[]> {
  const publicKey = await getAppSocialSessionPublicKey(input.accountId);
  if (!publicKey) {
    throw new Error('No OnSocial session key to remove.');
  }

  const adapter = nearConnectAdapter(input.wallet, input.accountId, {
    network: ACTIVE_NEAR_NETWORK,
  });

  const result = await revokeSession({
    wallet: adapter,
    publicKey,
    contract: 'core',
    path: getAppSocialSessionPath(input.accountId),
    network: ACTIVE_NEAR_NETWORK,
    store: getAppSocialSessionStore(),
    accountId: input.accountId,
  });
  clearStoredPendingSessionKey(input.accountId);
  return extractNearTransactionHashes(result);
}

export type AppSocialSessionTxResult = {
  ready: boolean;
  txHashes: string[];
};

/**
 * Renew an expired (or re-attach a missing-on-chain) session using the same
 * key material. When the FunctionCall key is still on the account, skips
 * AddKey and only refreshes the core permission TTL — no orphan keys.
 */
export async function renewAppSocialSession(input: {
  accountId: string;
  wallet: NearWalletBase;
}): Promise<AppSocialSessionTxResult> {
  const stored = await peekStoredAppSocialSession(input.accountId);
  if (!stored?.publicKey || !stored.secretSeedB64u) {
    return { ready: false, txHashes: [] };
  }

  let sessionKey: GeneratedSessionKey;
  try {
    sessionKey = await hydrateGeneratedSessionKey({
      publicKey: stored.publicKey,
      secretSeedB64u: stored.secretSeedB64u,
    });
  } catch {
    await clearAppSocialSession(input.accountId);
    return { ready: false, txHashes: [] };
  }

  const onChain = await sessionKeyValidOnChain(
    input.accountId,
    sessionKey.publicKey
  );
  const allowanceYocto = onChain
    ? await resolveOnChainSessionAllowanceYocto(
        input.accountId,
        sessionKey.publicKey
      )
    : FUNCTION_CALL_KEY_ALLOWANCE_YOCTO;

  const adapter = nearConnectAdapter(input.wallet, input.accountId, {
    network: ACTIVE_NEAR_NETWORK,
  });

  let grantResult: unknown;
  await bootstrapSession({
    ...appSessionBootstrapInput(
      input.accountId,
      appSessionFunctionCallKey(allowanceYocto)
    ),
    wallet: adapter,
    accountId: input.accountId,
    sessionKey,
    skipAddKey: onChain,
    onGrantResult: (result) => {
      grantResult = result;
    },
  });
  clearStoredPendingSessionKey(input.accountId);
  return {
    ready: Boolean(await restoreAppSocialSession(input.accountId)),
    txHashes: extractNearTransactionHashes(grantResult),
  };
}

/**
 * Explicit Allow access — wallet grant via bootstrap plan (AddKey + permission).
 * Prefer this from App access UI so confirmations can link Nearblocks.
 */
export async function grantAppSocialSession(input: {
  accountId: string;
  wallet: NearWalletBase;
}): Promise<AppSocialSessionTxResult> {
  if (await restoreAppSocialSession(input.accountId)) {
    clearStoredPendingSessionKey(input.accountId);
    return { ready: true, txHashes: [] };
  }

  if ((await getAppSocialSessionLifecycle(input.accountId)) === 'expired') {
    return renewAppSocialSession(input);
  }

  const pendingSessionKey = await loadOrCreatePendingSessionKey(input.accountId);
  if (await sessionKeyValidOnChain(input.accountId, pendingSessionKey.publicKey)) {
    await persistAppSessionAfterSignIn(input.accountId, pendingSessionKey);
    return { ready: true, txHashes: [] };
  }

  const adapter = nearConnectAdapter(input.wallet, input.accountId, {
    network: ACTIVE_NEAR_NETWORK,
  });

  let grantResult: unknown;
  await bootstrapSession({
    ...appSessionBootstrapInput(input.accountId),
    wallet: adapter,
    accountId: input.accountId,
    sessionKey: pendingSessionKey,
    onGrantResult: (result) => {
      grantResult = result;
    },
  });
  clearStoredPendingSessionKey(input.accountId);
  return {
    ready: Boolean(await restoreAppSocialSession(input.accountId)),
    txHashes: extractNearTransactionHashes(grantResult),
  };
}

export async function resolveAppSessionPlan(
  accountId: string
): Promise<AppSessionPlan> {
  if (await restoreAppSocialSession(accountId)) {
    return { sessionReady: true };
  }

  // Expired material must not mint a replacement pending key.
  if ((await getAppSocialSessionLifecycle(accountId)) === 'expired') {
    return { sessionReady: false };
  }

  return {
    sessionReady: false,
    pendingSessionKey: await loadOrCreatePendingSessionKey(accountId),
  };
}

async function persistAppSessionAfterSignIn(
  accountId: string,
  sessionKey: GeneratedSessionKey
): Promise<Session> {
  const allowanceYocto = await resolveOnChainSessionAllowanceYocto(
    accountId,
    sessionKey.publicKey
  );
  if (allowanceYocto === null) {
    throw new Error(
      'Session key is not on-chain yet. Connect your wallet and approve the session key, then try again.'
    );
  }

  const session = await persistSessionFromKey({
    ...appSessionBootstrapInput(
      accountId,
      appSessionFunctionCallKey(allowanceYocto)
    ),
    sessionKey,
  });
  clearStoredPendingSessionKey(accountId);
  return session;
}

export async function completeAppSessionAfterConnect(
  accountId: string,
  pendingSessionKey: GeneratedSessionKey
): Promise<void> {
  if (await restoreAppSocialSession(accountId)) {
    clearStoredPendingSessionKey(accountId);
    return;
  }

  if (await waitForSessionKeyOnChain(accountId, pendingSessionKey.publicKey)) {
    await persistAppSessionAfterSignIn(accountId, pendingSessionKey);
  }
}

export async function bootstrapAppSocialSession(
  accountId: string,
  connectWithOptions: (
    options: NearConnector_ConnectOptions
  ) => Promise<unknown>
): Promise<boolean> {
  if (await restoreAppSocialSession(accountId)) {
    clearStoredPendingSessionKey(accountId);
    return true;
  }

  // Expired sessions need an explicit renew (same key) — do not AddKey a twin.
  if ((await getAppSocialSessionLifecycle(accountId)) === 'expired') {
    return false;
  }

  const pendingSessionKey = await loadOrCreatePendingSessionKey(accountId);

  // User may have approved AddKey earlier while local session metadata was lost.
  if (await sessionKeyValidOnChain(accountId, pendingSessionKey.publicKey)) {
    await persistAppSessionAfterSignIn(accountId, pendingSessionKey);
    return true;
  }

  const addKeyOptions = buildAddKeyConnectOptions(pendingSessionKey);
  if (!addKeyOptions) {
    return false;
  }

  await connectWithOptions(addKeyOptions);
  await completeAppSessionAfterConnect(accountId, pendingSessionKey);
  return Boolean(await restoreAppSocialSession(accountId));
}
