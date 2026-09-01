'use client';

/**
 * Central browser OnSocial client access.
 *
 * ## Core contract writes (stand, post, react, profile, guild, …)
 * Use `getClient()`. Always write-capable:
 * - App access active → session attached, silent relay
 * - App access removed → wallet `defaultBroadcast` (one confirm per tx)
 * Do **not** gate these call sites on `hasSocialSession` / `if (!session)`.
 *
 * ## Gateway-authenticated prefs (mute list writes)
 * Use `getAuthedClient()` — JWT via session key or wallet `signMessage`.
 *
 * ## Session-required surfaces (DMs, push, notifications)
 * Use `getSessionClient()` — returns null session as an error; send users to
 * Keys → App access. Never auto-AddKey from these paths.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { OnSocial } from '@onsocial/sdk';
import type { Session } from '@onsocial/sdk/advanced';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { ensureAppGatewayAuth } from '@/lib/app-gateway-auth';
import { restoreAppSocialSession } from '@/lib/app-social-session';
import {
  getCachedAppSocialSession,
  invalidateAppSocialSessionCache,
  setCachedAppSocialSession,
} from '@/lib/app-social-session-cache';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

export type AppOnSocialClientBundle = {
  client: OnSocial;
  accountId: string;
  /** Set when App access is allowed; null means wallet signs each core write. */
  session: Session | null;
  wallet: NearWalletBase;
};

export type AppOnSocialAuthedClientBundle = AppOnSocialClientBundle & {
  token: string;
};

export type AppOnSocialSessionClientBundle = AppOnSocialClientBundle & {
  session: Session;
};

export { invalidateAppSocialSessionCache } from '@/lib/app-social-session-cache';

export class AppSocialSessionRequiredError extends Error {
  readonly code = 'APP_SOCIAL_SESSION_REQUIRED' as const;
  constructor(
    message = 'Allow App access to use this feature without signing every action.'
  ) {
    super(message);
    this.name = 'AppSocialSessionRequiredError';
  }
}

export function useAppOnSocialClient() {
  const { accountId, getSigningWallet } = useAppWallet();
  const accountIdRef = useRef(accountId);

  useEffect(() => {
    if (accountIdRef.current !== accountId) {
      accountIdRef.current = accountId;
      invalidateAppSocialSessionCache();
    }
  }, [accountId]);

  const getClient = useCallback(async (): Promise<AppOnSocialClientBundle> => {
    const { wallet, accountId: signingAccountId } = await getSigningWallet();

    let session = getCachedAppSocialSession(signingAccountId);
    if (!session) {
      session = await restoreAppSocialSession(signingAccountId);
      if (session) {
        setCachedAppSocialSession(signingAccountId, session);
      } else {
        invalidateAppSocialSessionCache();
      }
    }

    // Always pass wallet when there is no session so core writes still work.
    const client = createAppOnSocialClient(
      signingAccountId,
      session ? undefined : wallet
    );

    if (session) {
      client.attachSession(session);
    }

    return { client, accountId: signingAccountId, session, wallet };
  }, [getSigningWallet]);

  const getAuthedClient = useCallback(
    async (options?: {
      allowWalletFallback?: boolean;
    }): Promise<AppOnSocialAuthedClientBundle> => {
      const bundle = await getClient();
      const token = await ensureAppGatewayAuth({
        accountId: bundle.accountId,
        wallet: bundle.wallet,
        session: bundle.session,
        allowWalletFallback: options?.allowWalletFallback,
      });
      bundle.client.auth.setToken(token);
      return { ...bundle, token };
    },
    [getClient]
  );

  const getSessionClient =
    useCallback(async (): Promise<AppOnSocialSessionClientBundle> => {
      const bundle = await getClient();
      if (!bundle.session) {
        throw new AppSocialSessionRequiredError();
      }
      return { ...bundle, session: bundle.session };
    }, [getClient]);

  return { getClient, getAuthedClient, getSessionClient };
}
