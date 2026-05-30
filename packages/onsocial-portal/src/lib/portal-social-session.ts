import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  bootstrapSession,
  localStorageKeyStore,
  nearConnectAdapter,
  restoreSession,
  type Session,
} from '@onsocial/sdk/advanced';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import {
  isWalletUserCancellation,
  rethrowWalletActionError,
} from '@/lib/wallet-errors';
import { withWalletTimeout } from '@/lib/wallet-timeout';
import {
  accountNeedsWelcomeNearFunding,
  assertWalletAccount,
  ensureWelcomeNear,
} from '@/lib/welcome-near';

export const PORTAL_SOCIAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PORTAL_SOCIAL_SESSION_ALLOWANCE_YOCTO = '250000000000000000000000';
const SESSION_BOOTSTRAP_TIMEOUT_MS = 120_000;

export interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

export function getPortalSocialSessionPath(accountId: string): string {
  return `${accountId}/`;
}

export function getPortalSocialSessionStore() {
  return localStorageKeyStore('onsocial.portal.session.');
}

export async function restorePortalSocialSession(
  accountId: string
): Promise<Session | null> {
  return restoreSession({
    store: getPortalSocialSessionStore(),
    accountId,
    contract: 'core',
    path: getPortalSocialSessionPath(accountId),
    startingNonce: Date.now(),
    remainingAllowanceYocto: PORTAL_SOCIAL_SESSION_ALLOWANCE_YOCTO,
  });
}

async function bootstrapPortalSocialSession(
  signingWallet: NearWalletBase,
  signingAccountId: string
): Promise<Session> {
  return withWalletTimeout(
    bootstrapSession({
      wallet: nearConnectAdapter(signingWallet, signingAccountId, {
        network: ACTIVE_NEAR_NETWORK,
      }),
      accountId: signingAccountId,
      network: ACTIVE_NEAR_NETWORK,
      contract: 'core',
      path: getPortalSocialSessionPath(signingAccountId),
      ttlMs: PORTAL_SOCIAL_SESSION_TTL_MS,
      functionCallKey: {
        methodNames: ['execute'],
        allowanceYocto: PORTAL_SOCIAL_SESSION_ALLOWANCE_YOCTO,
      },
      storageDepositYocto: '0',
      store: getPortalSocialSessionStore(),
    }),
    SESSION_BOOTSTRAP_TIMEOUT_MS,
    'Session authorization timed out. Open your wallet extension and approve the OnSocial session transaction, then try again.'
  );
}

/**
 * Restore or bootstrap an OnSocial session for portal social writes.
 *
 * - Uses a live signing wallet (caller's `getSigningWallet` under the user gesture).
 * - Opens the wallet approval before welcome-NEAR polling so the popup is not blocked.
 * - Retries bootstrap once after welcome NEAR when the account still needs gas.
 */
export async function ensurePortalSocialSession(input: {
  accountId: string;
  getSigningWallet: () => Promise<SigningWallet>;
}): Promise<Session> {
  const restored = await restorePortalSocialSession(input.accountId);
  if (restored) {
    return restored;
  }

  const { wallet: signingWallet, accountId: signingAccountId } =
    await input.getSigningWallet();

  await assertWalletAccount(signingWallet, signingAccountId);

  const needsFunding = await accountNeedsWelcomeNearFunding(signingAccountId);

  try {
    return await bootstrapPortalSocialSession(signingWallet, signingAccountId);
  } catch (bootstrapError) {
    if (isWalletUserCancellation(bootstrapError) || !needsFunding) {
      rethrowWalletActionError(bootstrapError);
    }

    await ensureWelcomeNear(signingWallet, signingAccountId);
    return await bootstrapPortalSocialSession(signingWallet, signingAccountId);
  }
}
