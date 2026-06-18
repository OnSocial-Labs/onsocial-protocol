import type {
  NearConnector_ConnectOptions,
  NearWalletBase,
} from '@hot-labs/near-connect';
import {
  generateEd25519Key,
  localStorageKeyStore,
  persistSessionFromKey,
  resolveContractId,
  restoreSession,
  sessionId,
  type FunctionCallKeyLimits,
  type GeneratedSessionKey,
  type Session,
} from '@onsocial/sdk/advanced';
import {
  ACTIVE_NEAR_NETWORK,
  NEAR_FUNCTION_CALL_KEY_DEFAULT_ALLOWANCE_YOCTO,
} from '@/lib/portal-config';
import { viewFunctionCallAccessKey } from '@/lib/near-rpc';
import { requestWelcomeNearIfNeeded } from '@/lib/welcome-near';

/** Local session metadata — cleared on wallet disconnect. */
export const PORTAL_SOCIAL_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const SESSION_KEY_ON_CHAIN_POLL_MS = 500;
const SESSION_KEY_ON_CHAIN_TIMEOUT_MS = 15_000;

export interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

export interface PortalSessionPlan {
  sessionReady: boolean;
  pendingSessionKey?: GeneratedSessionKey;
}

export function getPortalSocialSessionPath(accountId: string): string {
  return `${accountId}/`;
}

export function getPortalSocialSessionStore() {
  return localStorageKeyStore('onsocial.portal.session.');
}

function portalSessionStorageId(accountId: string): string {
  return sessionId(accountId, 'core', getPortalSocialSessionPath(accountId));
}

function portalSessionFunctionCallKey(
  allowanceYocto: string | null = NEAR_FUNCTION_CALL_KEY_DEFAULT_ALLOWANCE_YOCTO
): FunctionCallKeyLimits {
  return {
    methodNames: ['execute'],
    allowanceYocto,
  };
}

function portalSessionBootstrapInput(
  accountId: string,
  functionCallKey?: FunctionCallKeyLimits
) {
  return {
    accountId,
    network: ACTIVE_NEAR_NETWORK,
    contract: 'core' as const,
    path: getPortalSocialSessionPath(accountId),
    ttlMs: PORTAL_SOCIAL_SESSION_TTL_MS,
    functionCallKey: functionCallKey ?? portalSessionFunctionCallKey(),
    storageDepositYocto: '0',
    store: getPortalSocialSessionStore(),
  };
}

function portalConnectAddFunctionCallKey(
  coreContractId: string,
  publicKey: string
): NearConnector_ConnectOptions['addFunctionCallKey'] {
  return {
    contractId: coreContractId,
    publicKey,
    allowMethods: { anyMethod: false, methodNames: ['execute'] },
    // Omit gasAllowance — near-connect defaults to limited 0.25 NEAR.
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
    addFunctionCallKey: portalConnectAddFunctionCallKey(
      coreContractId,
      pendingSessionKey.publicKey
    ),
  };
}

async function resolveOnChainSessionAllowanceYocto(
  accountId: string,
  publicKey: string
): Promise<string | null> {
  const coreContractId = coreContractIdForNetwork();
  if (!coreContractId) {
    return NEAR_FUNCTION_CALL_KEY_DEFAULT_ALLOWANCE_YOCTO;
  }

  const onChain = await viewFunctionCallAccessKey(accountId, publicKey);
  if (!onChain || onChain.receiverId !== coreContractId) {
    return null;
  }

  return (
    onChain.allowanceYocto ?? NEAR_FUNCTION_CALL_KEY_DEFAULT_ALLOWANCE_YOCTO
  );
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

export async function restorePortalSocialSession(
  accountId: string
): Promise<Session | null> {
  const stored = await getPortalSocialSessionStore().get(
    portalSessionStorageId(accountId)
  );
  if (!stored) {
    return null;
  }

  const remainingAllowanceYocto = await resolveOnChainSessionAllowanceYocto(
    accountId,
    stored.publicKey
  );
  if (remainingAllowanceYocto === null) {
    await clearPortalSocialSession(accountId);
    return null;
  }

  const session = await restoreSession({
    store: getPortalSocialSessionStore(),
    accountId,
    contract: 'core',
    path: getPortalSocialSessionPath(accountId),
    startingNonce: Date.now(),
    remainingAllowanceYocto,
  });
  if (!session) {
    return null;
  }

  return session;
}

export async function clearPortalSocialSession(
  accountId: string
): Promise<void> {
  await getPortalSocialSessionStore().delete(portalSessionStorageId(accountId));
}

/** Session plan for a confirmed wallet accountId. */
export async function resolvePortalSessionPlan(
  accountId: string
): Promise<PortalSessionPlan> {
  if (await restorePortalSocialSession(accountId)) {
    return { sessionReady: true };
  }

  return {
    sessionReady: false,
    pendingSessionKey: await generateEd25519Key(),
  };
}

async function persistPortalSessionAfterSignIn(
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

  return persistSessionFromKey({
    ...portalSessionBootstrapInput(
      accountId,
      portalSessionFunctionCallKey(allowanceYocto)
    ),
    sessionKey,
  });
}

/**
 * After sign-in: welcome NEAR when balance is low, then AddKey-only wallet connect.
 */
export async function finishPortalSessionLogin(
  accountId: string,
  pendingSessionKey: GeneratedSessionKey,
  signInWelcome: Promise<void> | null | undefined,
  connectWithOptions: (
    options: NearConnector_ConnectOptions
  ) => Promise<NearWalletBase>
): Promise<void> {
  if (await restorePortalSocialSession(accountId)) {
    return;
  }

  await signInWelcome?.catch(() => undefined);
  await requestWelcomeNearIfNeeded(accountId);

  const addKeyOptions = buildAddKeyConnectOptions(pendingSessionKey);
  if (!addKeyOptions) {
    return;
  }

  await connectWithOptions(addKeyOptions);
  await completePortalSessionAfterConnect(accountId, pendingSessionKey);
}

/** Verify AddKey on chain and persist local session metadata. */
export async function completePortalSessionAfterConnect(
  accountId: string,
  pendingSessionKey: GeneratedSessionKey
): Promise<void> {
  if (await restorePortalSocialSession(accountId)) {
    return;
  }

  if (await waitForSessionKeyOnChain(accountId, pendingSessionKey.publicKey)) {
    await persistPortalSessionAfterSignIn(accountId, pendingSessionKey);
  }
}

export const PORTAL_SOCIAL_SESSION_MISSING_MESSAGE =
  'Connect your wallet and approve the OnSocial session key, then try again.';

/** Restore session or null when the user still needs to connect / approve AddKey. */
export async function requirePortalSocialSession(
  accountId: string
): Promise<Session | null> {
  return restorePortalSocialSession(accountId);
}
