'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  assertCanApplyPageMood,
  mergeMoodIntoPageConfig,
  PAGE_MOOD_CATALOG,
  pageMoodPresetForId,
  type PageMoodId,
} from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
import { invalidatePageOwnerMoodCache } from '@/hooks/use-page-owner-mood';
import {
  invalidateViewerCommittedMoodCache,
  seedViewerCommittedMood,
} from '@/hooks/use-viewer-wallet-mood-vars';
import { useViewerWalletMoodContext } from '@/contexts/viewer-wallet-mood-context';
import { buildDaoPageMoodProposalPayload } from '@/features/protocol/dao-page-mood';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { accountIdsEqual } from '@/lib/account-match';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';

function formatApplyMoodError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not apply mood on-chain.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

export function useApplyMood(
  pageAccountId: string,
  opts?: { isDao?: boolean }
) {
  const isDao = Boolean(opts?.isDao);
  const router = useRouter();
  const {
    accountId,
    isConnected,
    isLoading,
    isBootstrappingSession,
    connect,
    getSigningWallet,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setMood } = useViewerWalletMoodContext();
  const { trackTransaction } = useAppTransactionFeedback();
  const { canPropose, eligibility, isLoading: eligibilityLoading } =
    useDaoPageCapability(pageAccountId, isDao);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAccountOwner =
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);
  /** Person owner, or DAO council member who can propose. */
  const isOwner = isAccountOwner || canPropose;
  const needsConnect = !isLoading && !isConnected;

  const applyMood = useCallback(
    async (moodId: PageMoodId): Promise<string | null> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();
        const asSelf = accountIdsEqual(signingAccountId, pageAccountId);

        if (!asSelf && !(isDao && canPropose)) {
          throw new Error(
            isDao
              ? 'Council members with propose rights can set this DAO mood.'
              : `Connect as @${pageAccountId} to update this page's mood.`
          );
        }

        const current = await fetchPageConfigFromBrowserProxy(pageAccountId);
        assertCanApplyPageMood(
          current,
          moodId,
          PAGE_MOOD_CATALOG,
          (id: string) => pageMoodPresetForId(id).label
        );

        if (asSelf) {
          const nextConfig = mergeMoodIntoPageConfig(current, moodId);
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
        }

        // DAO council — propose Call that writes page/main as the DAO.
        const payload = buildDaoPageMoodProposalPayload({
          moodId,
          currentConfig: current,
          daoLabel: pageAccountId,
        });
        const { accountId: signerId, wallet } = await getSigningWallet();
        const response = await submitProtocolProposal({
          daoAccountId: pageAccountId,
          accountId: signerId,
          wallet,
          payload,
        });
        const confirmed = await trackTransaction({
          txHashes: response.txHashes,
          submittedMessage: txToastGovPending.actionSubmitted('Mood'),
          successMessage:
            txToastGovSuccess.actionConfirmed('Mood proposal') +
            ' Approve to apply.',
          failureMessage: txToastGovError.actionFailed('Mood proposal'),
        });
        if (!confirmed) return null;
        router.refresh();
        return response.txHashes[0] ?? '';
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return null;
        }
        setError(formatApplyMoodError(err));
        return null;
      } finally {
        setIsApplying(false);
      }
    },
    [
      canPropose,
      getClient,
      getSigningWallet,
      isDao,
      pageAccountId,
      router,
      setMood,
      trackTransaction,
    ]
  );

  return {
    applyMood,
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    isAccountOwner,
    needsConnect,
    walletAccountId: accountId,
    eligibility,
    eligibilityLoading,
  };
}
