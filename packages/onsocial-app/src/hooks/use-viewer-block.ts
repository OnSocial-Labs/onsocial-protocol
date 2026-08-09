'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { canonicalAccountId } from '@/lib/account-match';
import { APP_SOCIAL_SESSION_MISSING_MESSAGE } from '@/lib/app-social-session';
import {
  deriveBlockedAccountIds,
  recordViewerBlock,
  reconcileViewerBlock,
} from '@/lib/viewer-block-ledger';
import {
  bumpGlobalViewerBlockLedger,
  clearGlobalViewerBlockState,
  getGlobalApiOutgoingBlockIds,
  getGlobalViewerBlockLedger,
  getGlobalViewerBlockLedgerVersion,
  isGlobalBlockPending,
  setGlobalApiBlockIds,
  setGlobalBlockPending,
  subscribeGlobalViewerBlockLedger,
} from '@/lib/viewer-block-global';
import {
  bumpGlobalViewerStandingLedger,
  getGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';
import { recordViewerStanding } from '@/lib/viewer-standing-ledger';
import { isViewerBlocking } from '@/lib/viewer-mute-block-filter';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const SOFT_RETRY_MS = [2000, 5000] as const;

type UseViewerBlockOptions = {
  /** When true, load edges on connect. Mount once from ViewerMuteBlockHost. */
  bootstrap?: boolean;
};

export function useViewerBlock(options: UseViewerBlockOptions = {}) {
  const bootstrap = options.bootstrap === true;
  const {
    isConnected,
    hasSocialSession,
    accountId: viewerAccountId,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const ledgerRef = useRef(getGlobalViewerBlockLedger());
  const [blockSyncVersion, setBlockSyncVersion] = useState(
    getGlobalViewerBlockLedgerVersion
  );
  const softRetryTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return subscribeGlobalViewerBlockLedger(() => {
      setBlockSyncVersion(getGlobalViewerBlockLedgerVersion());
    });
  }, []);

  const bumpBlockSync = useCallback(() => {
    bumpGlobalViewerBlockLedger();
  }, []);

  const refreshBlocks = useCallback(async () => {
    if (!isConnected || !viewerAccountId) {
      clearGlobalViewerBlockState();
      return;
    }
    try {
      const { client, session } = await getClient();
      if (!session) return;
      const viewer = canonicalAccountId(viewerAccountId);
      const [outgoingRaw, incomingRaw] = await Promise.all([
        client.blocks.listOutgoing(viewer, { limit: 500 }),
        client.blocks.listIncoming(viewer, { limit: 500 }),
      ]);
      const outgoing = outgoingRaw.map((id) => canonicalAccountId(id));
      const incoming = incomingRaw.map((id) => canonicalAccountId(id));
      setGlobalApiBlockIds({ outgoing, incoming });
      const apiSet = new Set(outgoing);
      for (const [accountId] of [...ledgerRef.current.entries()]) {
        reconcileViewerBlock(
          ledgerRef.current,
          accountId,
          apiSet.has(canonicalAccountId(accountId))
        );
      }
      bumpBlockSync();
    } catch {
      // Indexer lag is fine — keep optimistic ledger.
    }
  }, [bumpBlockSync, getClient, isConnected, viewerAccountId]);

  useEffect(() => {
    if (!bootstrap) return;
    void refreshBlocks();
  }, [bootstrap, refreshBlocks]);

  useEffect(() => {
    if (!bootstrap) return;
    if (!isConnected) clearGlobalViewerBlockState();
  }, [bootstrap, isConnected]);

  useEffect(() => {
    return () => {
      for (const timer of softRetryTimersRef.current) {
        window.clearTimeout(timer);
      }
      softRetryTimersRef.current = [];
    };
  }, []);

  const softRetryRefresh = useCallback(() => {
    for (const timer of softRetryTimersRef.current) {
      window.clearTimeout(timer);
    }
    softRetryTimersRef.current = SOFT_RETRY_MS.map((ms) =>
      window.setTimeout(() => {
        void refreshBlocks();
      }, ms)
    );
  }, [refreshBlocks]);

  const isBlockPendingForTarget = useCallback((targetAccountId: string) => {
    return isGlobalBlockPending(canonicalAccountId(targetAccountId));
  }, []);

  const updateBlock = useCallback(
    async (targetAccountId: string, shouldBlock: boolean): Promise<boolean> => {
      const target = canonicalAccountId(targetAccountId);
      if (!isConnected) {
        throw new Error('Connect your wallet before updating blocks.');
      }
      if (viewerAccountId && canonicalAccountId(viewerAccountId) === target) {
        throw new Error('You cannot block yourself.');
      }
      if (isGlobalBlockPending(target)) return false;

      setGlobalBlockPending(target, true);
      try {
        const { client, session } = await getClient();
        if (!session) {
          throw new Error(APP_SOCIAL_SESSION_MISSING_MESSAGE);
        }

        // Blocking clears the viewer's outbound stand so "no stands either way"
        // is true from this account without waiting on the other party.
        const actions = shouldBlock
          ? [
              client.blocks.add(target),
              client.standings.remove(target).catch(() => null),
            ]
          : [client.blocks.remove(target)];

        const [blockResponse] = await Promise.all(actions);
        if (!blockResponse) return false;

        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(blockResponse),
          successMessage: shouldBlock
            ? txToastSuccess.accountBlocked
            : txToastSuccess.accountUnblocked,
          failureMessage: shouldBlock
            ? txToastError.blockAccountFailed
            : txToastError.unblockAccountFailed,
        });
        if (!confirmed) return false;

        recordViewerBlock(ledgerRef.current, target, shouldBlock);
        if (shouldBlock) {
          recordViewerStanding(getGlobalViewerStandingLedger(), target, false);
          bumpGlobalViewerStandingLedger();
        }
        bumpBlockSync();
        softRetryRefresh();
        return true;
      } catch (error) {
        if (!isWalletUserCancellation(error)) throw error;
        return false;
      } finally {
        setGlobalBlockPending(target, false);
      }
    },
    [
      bumpBlockSync,
      getClient,
      isConnected,
      softRetryRefresh,
      trackTransaction,
      viewerAccountId,
    ]
  );

  const blockedAccountIds = deriveBlockedAccountIds(
    getGlobalApiOutgoingBlockIds(),
    ledgerRef.current
  );

  return {
    hasSocialSession,
    isConnected,
    blockSyncVersion,
    blockedAccountIds,
    isBlocking: isViewerBlocking,
    isBlockPendingForTarget,
    updateBlock,
    refreshBlocks,
  };
}
