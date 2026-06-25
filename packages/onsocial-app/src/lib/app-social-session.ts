import type { NearConnector_ConnectOptions } from '@hot-labs/near-connect';
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
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewFunctionCallAccessKey } from '@/lib/near-access-key';

export const APP_SOCIAL_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const FUNCTION_CALL_KEY_ALLOWANCE_YOCTO = '250000000000000000000000';
const SESSION_KEY_ON_CHAIN_POLL_MS = 500;
const SESSION_KEY_ON_CHAIN_TIMEOUT_MS = 15_000;

export interface AppSessionPlan {
  sessionReady: boolean;
  pendingSessionKey?: GeneratedSessionKey;
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

export async function restoreAppSocialSession(
  accountId: string
): Promise<Session | null> {
  const stored = await getAppSocialSessionStore().get(
    appSessionStorageId(accountId)
  );
  if (!stored) {
    return null;
  }

  const remainingAllowanceYocto = await resolveOnChainSessionAllowanceYocto(
    accountId,
    stored.publicKey
  );
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

export async function resolveAppSessionPlan(
  accountId: string
): Promise<AppSessionPlan> {
  if (await restoreAppSocialSession(accountId)) {
    return { sessionReady: true };
  }

  return {
    sessionReady: false,
    pendingSessionKey: await generateEd25519Key(),
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

  return persistSessionFromKey({
    ...appSessionBootstrapInput(
      accountId,
      appSessionFunctionCallKey(allowanceYocto)
    ),
    sessionKey,
  });
}

export async function completeAppSessionAfterConnect(
  accountId: string,
  pendingSessionKey: GeneratedSessionKey
): Promise<void> {
  if (await restoreAppSocialSession(accountId)) {
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
  const plan = await resolveAppSessionPlan(accountId);
  if (plan.sessionReady) {
    return true;
  }

  if (!plan.pendingSessionKey) {
    return false;
  }

  const addKeyOptions = buildAddKeyConnectOptions(plan.pendingSessionKey);
  if (!addKeyOptions) {
    return false;
  }

  await connectWithOptions(addKeyOptions);
  await completeAppSessionAfterConnect(accountId, plan.pendingSessionKey);
  return Boolean(await restoreAppSocialSession(accountId));
}

export const APP_SOCIAL_SESSION_MISSING_MESSAGE =
  'Connect your wallet and approve the OnSocial session key, then try again.';
