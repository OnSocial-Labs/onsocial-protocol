'use client';

import { useCallback } from 'react';
import type { OnSocial } from '@onsocial/sdk';
import type { Session } from '@onsocial/sdk/advanced';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { restoreAppSocialSession } from '@/lib/app-social-session';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';

interface AppOnSocialClientBundle {
  client: OnSocial;
  accountId: string;
  session: Session | null;
}

export function useAppOnSocialClient() {
  const { getSigningWallet } = useAppWallet();

  const getClient = useCallback(async (): Promise<AppOnSocialClientBundle> => {
    const { wallet, accountId } = await getSigningWallet();
    const session = await restoreAppSocialSession(accountId);
    const client = createAppOnSocialClient(
      accountId,
      session ? undefined : wallet
    );

    if (session) {
      client.attachSession(session);
    }

    return { client, accountId, session };
  }, [getSigningWallet]);

  return { getClient };
}
