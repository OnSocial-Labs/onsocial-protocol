'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
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
import { isViewerBlocking } from '@/lib/viewer-mute-block-filter';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const SOFT_RETRY_MS = [2000, 5000] as const;

export function useViewerBlock() {
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
      const [outgoing, incoming] = await Promise.all([
        client.blocks.listOutgoing(viewerAccountId, { limit: 500 }),
        client.blocks.listIncoming(viewerAccountId, { limit: 500 }),
      ]);
      setGlobalApiBlockIds({ outgoing, incoming });
      for (const id of outgoing) {
        reconcileViewerBlock(ledgerRef.current, id, true);
      }
      bumpBlockSync();
    } catch {
      // Indexer lag is fine — keep optimistic ledger.
    }
  }, [bumpBlockSync, getClient, isConnected, viewerAccountId]);

  useEffect(() => {
    void refreshBlocks();
  }, [refreshBlocks]);

  useEffect(() => {
    if (!isConnected) clearGlobalViewerBlockState();
  }, [isConnected]);

  const softRetryRefresh = useCallback(() => {
    for (const ms of SOFT_RETRY_MS) {
      window.setTimeout(() => {
        void refreshBlocks();
      }, ms);
    }
  }, [refreshBlocks]);

  const isBlockPendingForTarget = useCallback((targetAccountId: string) => {
    return isGlobalBlockPending(targetAccountId);
  }, []);

  const updateBlock = useCallback(
    async (targetAccountId: string, shouldBlock: boolean): Promise<boolean> => {
      if (!isConnected) {
        throw new Error('Connect your wallet before updating blocks.');
      }
      if (viewerAccountId === targetAccountId) {
        throw new Error('You cannot block yourself.');
      }
      if (isGlobalBlockPending(targetAccountId)) return false;

      setGlobalBlockPending(targetAccountId, true);
      try {
        const { client, session } = await getClient();
        if (!session) {
          throw new Error(APP_SOCIAL_SESSION_MISSING_MESSAGE);
        }

        const response = shouldBlock
          ? await client.blocks.add(targetAccountId)
          : await client.blocks.remove(targetAccountId);

        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: shouldBlock
            ? txToastConfirming.blockingAccount
            : txToastConfirming.unblockingAccount,
          successMessage: shouldBlock
            ? txToastSuccess.accountBlocked
            : txToastSuccess.accountUnblocked,
          failureMessage: shouldBlock
            ? txToastError.blockAccountFailed
            : txToastError.unblockAccountFailed,
        });
        if (!confirmed) return false;

        recordViewerBlock(ledgerRef.current, targetAccountId, shouldBlock);
        bumpBlockSync();
        softRetryRefresh();
        return true;
      } catch (error) {
        if (!isWalletUserCancellation(error)) throw error;
        return false;
      } finally {
        setGlobalBlockPending(targetAccountId, false);
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
