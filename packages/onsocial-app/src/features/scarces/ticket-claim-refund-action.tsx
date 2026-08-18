'use client';

import { useCallback, useEffect, useState } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { claimDropTokenRefund } from '@/features/scarces/drop-owner-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { accountIdsEqual } from '@/lib/account-match';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import type { TicketTokenStatus } from '@/features/scarces/ticket-token-status';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/**
 * Holder claim control — shown on Show pass when the drop is cancelled and
 * this seat is still eligible.
 */
export function TicketClaimRefundAction({
  collectionId,
  tokenId,
  status,
  onClaimed,
}: {
  collectionId: string;
  tokenId: string;
  status: TicketTokenStatus | null;
  onClaimed?: () => void;
}) {
  const { accountId, isConnected, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [dropCancelled, setDropCancelled] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void viewNearContract<{ cancelled?: boolean } | null>(
      SCARCES_CONTRACT,
      'get_collection',
      { collection_id: collectionId }
    )
      .then((record) => {
        if (!cancelled) setDropCancelled(Boolean(record?.cancelled));
      })
      .catch(() => {
        if (!cancelled) setDropCancelled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const eligible =
    dropCancelled &&
    status != null &&
    !status.isRefunded &&
    !status.isFullyRedeemed &&
    Boolean(accountId) &&
    accountIdsEqual(accountId ?? '', status.ownerId);

  const claim = useCallback(async () => {
    if (!eligible || !isConnected || pending) return;
    setPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const response = await claimDropTokenRefund(
        signerId,
        wallet,
        tokenId,
        collectionId
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.claimingTicketRefund,
        successMessage: txToastSuccess.ticketRefundClaimed,
        failureMessage: txToastError.claimTicketRefundFailed,
      });
      if (confirmed) onClaimed?.();
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.claimTicketRefundFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    collectionId,
    eligible,
    getSigningWallet,
    isConnected,
    onClaimed,
    pending,
    setTxResult,
    tokenId,
    trackTransaction,
  ]);

  if (!eligible) return null;

  return (
    <OsSheetActions
      layout="stack"
      tone="frosted-primary"
      borderless
      className="ticket-claim-refund-actions"
    >
      <OsSheetAction
        type="button"
        variant="primary"
        ready
        pending={pending}
        pendingLabel="Claiming…"
        disabled={pending}
        onClick={() => {
          void claim();
        }}
      >
        Claim refund
      </OsSheetAction>
    </OsSheetActions>
  );
}
