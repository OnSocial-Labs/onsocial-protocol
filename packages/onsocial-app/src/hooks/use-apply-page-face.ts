'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PageConfig, PageFaceConfig } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { sanitizePageFace } from '@/lib/page-face';
import type { PageAvatarMode, PageHeroSource, PublicPageConfig } from '@/lib/page-data';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function formatApplyFaceError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not update page layout.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

function toSdkPageConfig(config: PublicPageConfig): PageConfig {
  return config as PageConfig;
}

export function useApplyPageFace(
  pageAccountId: string,
  initialConfig: PublicPageConfig
) {
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

  const applyFacePatch = useCallback(
    async (patch: Partial<PageFaceConfig>): Promise<boolean> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to update this page layout.`
          );
        }

        const current = await client.pages.getConfig(signingAccountId);
        const fallback = toSdkPageConfig(initialConfig);
        const mergedFace = sanitizePageFace({
          ...fallback.face,
          ...current.face,
          ...patch,
        });

        const next: PageConfig = {
          ...fallback,
          ...current,
          face: mergedFace,
        };

        await client.pages.setConfig(next, { wait: true });
        router.refresh();
        return true;
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return false;
        }
        setError(formatApplyFaceError(err));
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [getClient, initialConfig, pageAccountId, router]
  );

  const applyAvatarMode = useCallback(
    async (avatarMode: PageAvatarMode): Promise<boolean> =>
      applyFacePatch({ avatarMode }),
    [applyFacePatch]
  );

  const applyHeroSource = useCallback(
    async (heroSource: PageHeroSource): Promise<boolean> =>
      applyFacePatch({ heroSource }),
    [applyFacePatch]
  );

  return {
    applyAvatarMode,
    applyFacePatch,
    applyHeroSource,
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    needsConnect: !isLoading && !isConnected,
    walletAccountId: accountId,
  };
}
