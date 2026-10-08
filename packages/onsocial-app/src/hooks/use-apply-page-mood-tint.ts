'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  mergePageMoodTintIntoPageConfig,
  type PageMoodId,
} from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerWalletMoodContext } from '@/contexts/viewer-wallet-mood-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { invalidatePageOwnerMoodCache } from '@/hooks/use-page-owner-mood';
import {
  invalidateViewerCommittedMoodCache,
  seedViewerCommittedMood,
} from '@/hooks/use-viewer-wallet-mood-vars';
import { accountIdsEqual } from '@/lib/account-match';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function formatApplyMoodTintError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not save ink hue on-chain.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

export function useApplyPageMoodTint(pageAccountId: string) {
  const router = useRouter();
  const { accountId, isConnected, isLoading, isBootstrappingSession, connect } =
    useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setMood } = useViewerWalletMoodContext();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);
  const needsConnect = !isLoading && !isConnected;

  const applyMoodTint = useCallback(
    async (moodId: PageMoodId, hue: number): Promise<string | null> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to update this page's ink hue.`
          );
        }

        const current = await fetchPageConfigFromBrowserProxy(signingAccountId);
        const nextConfig = mergePageMoodTintIntoPageConfig(
          current,
          moodId,
          hue
        );

        const response = await client.pages.setConfig(nextConfig, {
          wait: true,
        });
        const nextMood = resolvePortfolioMood(nextConfig);
        invalidateViewerCommittedMoodCache(signingAccountId);
        invalidatePageOwnerMoodCache(signingAccountId);
        seedViewerCommittedMood(signingAccountId, nextMood);
        setMood(nextMood);
        router.refresh();
        return collectRelayTxHashes(response)[0] ?? '';
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return null;
        }
        setError(formatApplyMoodTintError(err));
        return null;
      } finally {
        setIsApplying(false);
      }
    },
    [getClient, pageAccountId, router, setMood]
  );

  return {
    applyMoodTint,
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    needsConnect,
    walletAccountId: accountId,
  };
}
