'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function formatProfileMediaError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not update profile media.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

export function useApplyProfileMedia(pageAccountId: string) {
  const router = useRouter();
  const {
    accountId,
    isConnected,
    isLoading,
    isBootstrappingSession,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);

  const applyProfileMedia = useCallback(
    async (
      field: 'avatar' | 'banner',
      file: File | null
    ): Promise<boolean> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to update profile media.`
          );
        }

        await client.profiles.update(
          field === 'avatar'
            ? { avatar: file }
            : { banner: file },
          { wait: true }
        );
        router.refresh();
        return true;
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return false;
        }
        setError(formatProfileMediaError(err));
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [getClient, pageAccountId, router]
  );

  return {
    applyProfileBanner: (file: File | null) => applyProfileMedia('banner', file),
    applyProfileAvatar: (file: File | null) => applyProfileMedia('avatar', file),
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    needsConnect: !isLoading && !isConnected,
    walletAccountId: accountId,
  };
}
