'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { fallbackLabel } from '@/lib/profile-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useActivatePage(pageAccountId: string) {
  const router = useRouter();
  const { getClient } = useAppOnSocialClient();
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = useCallback(async () => {
    setError(null);
    setIsActivating(true);

    try {
      const { client, accountId: signingAccountId } = await getClient();

      if (!accountIdsEqual(signingAccountId, pageAccountId)) {
        throw new Error(`Connect as @${pageAccountId} to activate this page.`);
      }

      const label = fallbackLabel(signingAccountId);

      await client.profiles.update(
        {
          name: label,
          bio: `OnSocial page for @${signingAccountId}`,
        },
        { wait: true }
      );

      await client.pages.setConfig(
        {
          template: 'minimal',
          sections: ['profile', 'links', 'posts', 'badges'],
          tagline: 'Welcome to my OnSocial page.',
        },
        { wait: true }
      );

      await client.pages.setMood('protocol', { wait: true });

      router.refresh();
    } catch (err) {
      if (isWalletUserCancellation(err)) {
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Could not activate your OnSocial page.'
      );
    } finally {
      setIsActivating(false);
    }
  }, [getClient, pageAccountId, router]);

  return {
    activate,
    error,
    isActivating,
  };
}
