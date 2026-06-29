'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { OnSocial } from '@onsocial/sdk';
import type { Session } from '@onsocial/sdk/advanced';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { restoreAppSocialSession } from '@/lib/app-social-session';
import {
  getCachedAppSocialSession,
  invalidateAppSocialSessionCache,
  setCachedAppSocialSession,
} from '@/lib/app-social-session-cache';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

interface AppOnSocialClientBundle {
  client: OnSocial;
  accountId: string;
  session: Session | null;
}

export { invalidateAppSocialSessionCache } from '@/lib/app-social-session-cache';

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

    const client = createAppOnSocialClient(
      signingAccountId,
      session ? undefined : wallet
    );

    if (session) {
      client.attachSession(session);
    }

    return { client, accountId: signingAccountId, session };
  }, [getSigningWallet]);

  return { getClient };
}
