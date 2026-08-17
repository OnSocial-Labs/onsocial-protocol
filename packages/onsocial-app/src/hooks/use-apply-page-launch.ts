'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PageConfig, PageSection } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import type { PublicPageConfig } from '@/lib/page-data';
import {
  sanitizeLinkNotes,
  sanitizeSectionPins,
} from '@/lib/page-launch-config';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';

function formatApplyLaunchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not update Launch chapters.';
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

export function useApplyPageLaunch(
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
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);

  const applyLaunchPatch = useCallback(
    async (patch: {
      sections?: PageSection[];
      sectionPins?: PublicPageConfig['sectionPins'];
      linkNotes?: PublicPageConfig['linkNotes'];
    }): Promise<string | null> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to update Launch chapters.`
          );
        }

        const current = await fetchPageConfigFromBrowserProxy(signingAccountId);
        const fallback = toSdkPageConfig(initialConfig);
        const next: PageConfig = {
          ...fallback,
          ...current,
        };

        if (patch.sections) {
          next.sections = patch.sections;
        }
        if (patch.sectionPins !== undefined) {
          const pins = sanitizeSectionPins(patch.sectionPins);
          next.sectionPins =
            Object.keys(pins).length > 0 ? pins : undefined;
        }
        if (patch.linkNotes !== undefined) {
          const notes = sanitizeLinkNotes(patch.linkNotes);
          next.linkNotes =
            Object.keys(notes).length > 0 ? notes : undefined;
        }

        const response = await client.pages.setConfig(next, { wait: true });
        router.refresh();
        return collectRelayTxHashes(response)[0] ?? '';
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return null;
        }
        setError(formatApplyLaunchError(err));
        return null;
      } finally {
        setIsApplying(false);
      }
    },
    [getClient, initialConfig, pageAccountId, router]
  );

  return {
    applyLaunchPatch,
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    needsConnect: !isLoading && !isConnected,
    walletAccountId: accountId,
  };
}
