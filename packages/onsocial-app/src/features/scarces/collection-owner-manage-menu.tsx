'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
  PauseFillIcon,
  PlayFillIcon,
  TrashIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { DropCancelConfirmPanel } from '@/components/wallet/drop-cancel-confirm-panel';
import { DropDeleteConfirmPanel } from '@/components/wallet/drop-delete-confirm-panel';
import { DropWithdrawRefundsConfirmPanel } from '@/components/wallet/drop-withdraw-refunds-confirm-panel';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import type { CollectionStatus } from '@/features/scarces/collections-data';
import { DropExtendEntryPanel } from '@/features/scarces/drop-extend-entry-panel';
import {
  canCancelDrop,
  canDeleteDrop,
  canExtendTicketEntry,
  canPauseDrop,
  canResumeDrop,
  canWithdrawUnclaimedRefunds,
  cancelDropCollection,
  deleteDropCollection,
  extendTicketEntryAccess,
  pauseDropCollection,
  resumeDropCollection,
  withdrawUnclaimedDropRefunds,
} from '@/features/scarces/drop-owner-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { dropDeleteConfirmCopy } from '@/lib/drop-delete-confirm-copy';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { viewNearContract } from '@/lib/app-near-rpc';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

type ManagePanel = 'menu' | 'cancel' | 'delete' | 'withdraw' | 'extend';

/**
 * Owner Drop page control — compact Sell-style pill beside bookmark / share,
 * Pause / Resume / Cancel / Delete / Withdraw / Postpone entry in a drawer.
 */
export function CollectionOwnerManageMenu({
  collectionId,
  title,
  status,
  minted,
  priceNear = null,
  kind = null,
  renewable = false,
  eventEndsAtMs = null,
  onManaged,
}: {
  collectionId: string;
  title: string;
  status: CollectionStatus;
  minted: number;
  priceNear?: string | null;
  kind?: string | null;
  renewable?: boolean;
  eventEndsAtMs?: number | null;
  onManaged: (
    change:
      | 'paused'
      | 'resumed'
      | 'deleted'
      | 'cancelled'
      | 'refunds_withdrawn'
      | 'entry_extended'
  ) => void;
}) {
  const { isConnected, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<ManagePanel>('menu');
  const [ownerPending, setOwnerPending] = useState(false);
  const [refundDeadlineMs, setRefundDeadlineMs] = useState<number | null>(null);
  const [refundPoolYocto, setRefundPoolYocto] = useState<string | null>(null);

  const dropTitle = title.trim() || 'Drop';
  const showPause = canPauseDrop(status);
  const showResume = canResumeDrop(status);
  const showDelete = canDeleteDrop(minted, status);
  const showCancel = canCancelDrop(status);
  const showExtend = canExtendTicketEntry({ kind, renewable, status });
  const showWithdraw = canWithdrawUnclaimedRefunds({
    cancelled: status === 'cancelled',
    refundDeadlineMs,
    refundPoolYocto,
  });

  useEffect(() => {
    if (status !== 'cancelled') {
      setRefundDeadlineMs(null);
      setRefundPoolYocto(null);
      return;
    }
    let cancelledFetch = false;
    void viewNearContract<{
      refund_deadline?: number | null;
      refund_pool?: string | { '0'?: string } | null;
    } | null>(SCARCES_CONTRACT, 'get_collection', {
      collection_id: collectionId,
    })
      .then((record) => {
        if (cancelledFetch || !record) return;
        const deadlineNs = record.refund_deadline;
        setRefundDeadlineMs(
          deadlineNs != null && Number.isFinite(deadlineNs) && deadlineNs > 0
            ? Math.floor(deadlineNs / 1_000_000)
            : null
        );
        const pool = record.refund_pool;
        const poolStr =
          typeof pool === 'string'
            ? pool
            : pool && typeof pool === 'object' && typeof pool['0'] === 'string'
              ? pool['0']
              : null;
        setRefundPoolYocto(poolStr);
      })
      .catch(() => {
        if (!cancelledFetch) {
          setRefundDeadlineMs(null);
          setRefundPoolYocto(null);
        }
      });
    return () => {
      cancelledFetch = true;
    };
  }, [collectionId, status]);

  const close = useCallback(() => {
    setOpen(false);
    setPanel('menu');
  }, []);

  const runLifecycle = useCallback(
    async (kind: 'paused' | 'resumed' | 'deleted') => {
      if (!isConnected || ownerPending) return;
      if (kind !== 'deleted') close();
      setOwnerPending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const response =
          kind === 'paused'
            ? await pauseDropCollection(signerId, wallet, collectionId)
            : kind === 'resumed'
              ? await resumeDropCollection(signerId, wallet, collectionId)
              : await deleteDropCollection(signerId, wallet, collectionId);
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage:
            kind === 'paused'
              ? txToastConfirming.pausingCollection
              : kind === 'resumed'
                ? txToastConfirming.resumingCollection
                : txToastConfirming.deletingCollection,
          successMessage:
            kind === 'paused'
              ? txToastSuccess.collectionPaused
              : kind === 'resumed'
                ? txToastSuccess.collectionResumed
                : txToastSuccess.collectionDeleted,
          failureMessage:
            kind === 'paused'
              ? txToastError.pauseCollectionFailed
              : kind === 'resumed'
                ? txToastError.resumeCollectionFailed
                : txToastError.deleteCollectionFailed,
        });
        if (confirmed) {
          close();
          onManaged(kind);
        }
      } catch (error) {
        if (isWalletUserCancellation(error)) return;
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error
              ? error.message
              : kind === 'paused'
                ? txToastError.pauseCollectionFailed
                : kind === 'resumed'
                  ? txToastError.resumeCollectionFailed
                  : txToastError.deleteCollectionFailed,
        });
      } finally {
        setOwnerPending(false);
      }
    },
    [
      close,
      collectionId,
      getSigningWallet,
      isConnected,
      onManaged,
      ownerPending,
      setTxResult,
      trackTransaction,
    ]
  );

  const runCancel = useCallback(
    async (input: {
      refundPerTokenNear: string;
      claimDays: number;
      refundableCount: number;
    }) => {
      if (!isConnected || ownerPending) return;
      setOwnerPending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const response = await cancelDropCollection(signerId, wallet, {
          collectionId,
          refundPerTokenNear: input.refundPerTokenNear,
          refundableCount: input.refundableCount,
          claimDays: input.claimDays,
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.cancelingCollection,
          successMessage: txToastSuccess.collectionCancelled,
          failureMessage: txToastError.cancelCollectionFailed,
        });
        if (confirmed) {
          close();
          onManaged('cancelled');
        }
      } catch (error) {
        if (isWalletUserCancellation(error)) return;
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error
              ? error.message
              : txToastError.cancelCollectionFailed,
        });
      } finally {
        setOwnerPending(false);
      }
    },
    [
      close,
      collectionId,
      getSigningWallet,
      isConnected,
      onManaged,
      ownerPending,
      setTxResult,
      trackTransaction,
    ]
  );

  const runWithdraw = useCallback(async () => {
    if (!isConnected || ownerPending) return;
    setOwnerPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const response = await withdrawUnclaimedDropRefunds(
        signerId,
        wallet,
        collectionId
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.withdrawingUnclaimedRefunds,
        successMessage: txToastSuccess.unclaimedRefundsWithdrawn,
        failureMessage: txToastError.withdrawUnclaimedRefundsFailed,
      });
      if (confirmed) {
        close();
        onManaged('refunds_withdrawn');
      }
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.withdrawUnclaimedRefundsFailed,
      });
    } finally {
      setOwnerPending(false);
    }
  }, [
    close,
    collectionId,
    getSigningWallet,
    isConnected,
    onManaged,
    ownerPending,
    setTxResult,
    trackTransaction,
  ]);

  const runExtend = useCallback(
    async (newExpiresAtMs: number) => {
      if (!isConnected || ownerPending) return;
      setOwnerPending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const { responses } = await extendTicketEntryAccess(signerId, wallet, {
          collectionId,
          newExpiresAtMs,
        });
        const confirmed = await trackTransaction({
          txHashes: responses.flatMap((r) => collectRelayTxHashes(r)),
          submittedMessage: txToastConfirming.extendingTicketEntry,
          successMessage: txToastSuccess.ticketEntryExtended,
          failureMessage: txToastError.extendTicketEntryFailed,
        });
        if (confirmed) {
          close();
          onManaged('entry_extended');
        }
      } catch (error) {
        if (isWalletUserCancellation(error)) return;
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error
              ? error.message
              : txToastError.extendTicketEntryFailed,
        });
      } finally {
        setOwnerPending(false);
      }
    },
    [
      close,
      collectionId,
      getSigningWallet,
      isConnected,
      onManaged,
      ownerPending,
      setTxResult,
      trackTransaction,
    ]
  );

  const items = useMemo<ActionDrawerItem[]>(() => {
    const list: ActionDrawerItem[] = [];
    if (showExtend) {
      list.push({
        id: 'extend',
        section: 'Event',
        label: 'Postpone entry',
        description: 'Extend when tickets can still be admitted',
        disabled: ownerPending,
        onSelect: () => {
          setPanel('extend');
        },
      });
    }
    if (showPause) {
      list.push({
        id: 'pause',
        section: 'Sale',
        label: ownerPending ? 'Pausing…' : 'Pause drop',
        description: 'Stop minting for now',
        disabled: ownerPending,
        leading: <PauseFillIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void runLifecycle('paused');
        },
      });
    }
    if (showResume) {
      list.push({
        id: 'resume',
        section: 'Sale',
        label: ownerPending ? 'Resuming…' : 'Resume drop',
        description: 'Open minting again',
        disabled: ownerPending,
        leading: <PlayFillIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void runLifecycle('resumed');
        },
      });
    }
    if (showCancel) {
      list.push({
        id: 'cancel',
        section: 'Refunds',
        label: 'Cancel drop',
        description: 'Stop the drop and fund ticket refunds',
        destructive: true,
        disabled: ownerPending,
        onSelect: () => {
          setPanel('cancel');
        },
      });
    }
    if (showWithdraw) {
      list.push({
        id: 'withdraw',
        section: 'Refunds',
        label: 'Withdraw unclaimed',
        description: 'Reclaim leftover refund pool NEAR',
        disabled: ownerPending,
        onSelect: () => {
          setPanel('withdraw');
        },
      });
    } else if (status === 'cancelled') {
      list.push({
        id: 'refunds-open',
        section: 'Refunds',
        label: 'Refunds open',
        description: 'Holders can claim until the window ends',
        disabled: true,
        onSelect: () => {},
      });
    }
    if (showDelete) {
      list.push({
        id: 'delete',
        section: 'Sale',
        label: 'Delete drop',
        description: 'Only if nothing was minted — confirms first',
        destructive: true,
        disabled: ownerPending,
        leading: <TrashIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          setPanel('delete');
        },
      });
    }
    return list;
  }, [
    ownerPending,
    runLifecycle,
    showCancel,
    showDelete,
    showExtend,
    showPause,
    showResume,
    showWithdraw,
    status,
  ]);

  if (
    !showPause &&
    !showResume &&
    !showDelete &&
    !showCancel &&
    !showWithdraw &&
    !showExtend &&
    status !== 'cancelled'
  ) {
    return null;
  }

  const deleteConfirm = dropDeleteConfirmCopy({ title: dropTitle });

  const drawerLabel =
    panel === 'delete'
      ? deleteConfirm.title
      : panel === 'cancel'
        ? `Cancel ${dropTitle}?`
        : panel === 'withdraw'
          ? `Withdraw unclaimed from ${dropTitle}?`
          : panel === 'extend'
            ? `Postpone entry · ${dropTitle}`
            : dropTitle;

  return (
    <div className="collection-product-manage">
      <OsSheetActions
        layout="row-compact"
        tone="frosted-primary"
        borderless
        className="collectibles-play-sell-action"
      >
        <OsSheetAction
          type="button"
          variant="primary"
          ready
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          Manage
        </OsSheetAction>
      </OsSheetActions>
      <ActionDrawer
        open={open}
        onClose={
          panel === 'menu'
            ? close
            : () => {
                setPanel('menu');
              }
        }
        label={drawerLabel}
        copy={panel === 'menu' ? 'Owner controls' : undefined}
        listAriaLabel={
          panel === 'menu' ? `Manage ${dropTitle}` : drawerLabel
        }
        closeAriaLabel={panel === 'menu' ? 'Close' : 'Back to manage'}
        items={panel === 'menu' ? items : undefined}
      >
        {panel === 'delete' ? (
          <DropDeleteConfirmPanel
            title={dropTitle}
            pending={ownerPending}
            onConfirm={() => {
              void runLifecycle('deleted');
            }}
            onCancel={() => setPanel('menu')}
          />
        ) : null}
        {panel === 'cancel' ? (
          <DropCancelConfirmPanel
            collectionId={collectionId}
            title={dropTitle}
            minted={minted}
            priceNear={priceNear}
            pending={ownerPending}
            onConfirm={(input) => {
              void runCancel(input);
            }}
            onCancel={() => setPanel('menu')}
          />
        ) : null}
        {panel === 'withdraw' ? (
          <DropWithdrawRefundsConfirmPanel
            title={dropTitle}
            pending={ownerPending}
            onConfirm={() => {
              void runWithdraw();
            }}
            onCancel={() => setPanel('menu')}
          />
        ) : null}
        {panel === 'extend' ? (
          <DropExtendEntryPanel
            currentEndsAtMs={eventEndsAtMs}
            pending={ownerPending}
            onConfirm={(newExpiresAtMs) => {
              void runExtend(newExpiresAtMs);
            }}
          />
        ) : null}
      </ActionDrawer>
    </div>
  );
}
