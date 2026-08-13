'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { DropDeleteConfirmPanel } from '@/components/wallet/drop-delete-confirm-panel';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import type { CollectionStatus } from '@/features/scarces/collections-data';
import {
  canDeleteDrop,
  canPauseDrop,
  canResumeDrop,
  deleteDropCollection,
  pauseDropCollection,
  resumeDropCollection,
} from '@/features/scarces/drop-owner-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { dropDeleteConfirmCopy } from '@/lib/drop-delete-confirm-copy';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/**
 * Owner Drop page control — compact Sell-style pill beside bookmark / share,
 * Pause / Resume / Delete in a drawer (same confirm pattern as Drops list ⋮).
 */
export function CollectionOwnerManageMenu({
  collectionId,
  title,
  status,
  minted,
  onManaged,
}: {
  collectionId: string;
  title: string;
  status: CollectionStatus;
  minted: number;
  onManaged: (change: 'paused' | 'resumed' | 'deleted') => void;
}) {
  const { isConnected, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ownerPending, setOwnerPending] = useState(false);

  const dropTitle = title.trim() || 'Drop';
  const showPause = canPauseDrop(status);
  const showResume = canResumeDrop(status);
  const showDelete = canDeleteDrop(minted, status);

  const close = useCallback(() => {
    setOpen(false);
    setConfirmDelete(false);
  }, []);

  const runOwnerAction = useCallback(
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

  const items = useMemo<ActionDrawerItem[]>(() => {
    const list: ActionDrawerItem[] = [];
    if (showPause) {
      list.push({
        id: 'pause',
        section: 'Sale',
        label: ownerPending ? 'Pausing…' : 'Pause drop',
        description: 'Stop minting for now',
        disabled: ownerPending,
        leading: <PauseFillIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void runOwnerAction('paused');
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
          void runOwnerAction('resumed');
        },
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
          setConfirmDelete(true);
        },
      });
    }
    return list;
  }, [ownerPending, runOwnerAction, showDelete, showPause, showResume]);

  if (!showPause && !showResume && !showDelete) return null;

  const deleteConfirm = dropDeleteConfirmCopy({ title: dropTitle });

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
        onClose={confirmDelete ? () => setConfirmDelete(false) : close}
        label={confirmDelete ? deleteConfirm.title : dropTitle}
        copy={confirmDelete ? undefined : 'Owner controls'}
        listAriaLabel={
          confirmDelete ? deleteConfirm.title : `Manage ${dropTitle}`
        }
        closeAriaLabel={confirmDelete ? 'Back to manage' : 'Close'}
        items={confirmDelete ? undefined : items}
      >
        {confirmDelete ? (
          <DropDeleteConfirmPanel
            title={dropTitle}
            pending={ownerPending}
            onConfirm={() => {
              void runOwnerAction('deleted');
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : null}
      </ActionDrawer>
    </div>
  );
}
