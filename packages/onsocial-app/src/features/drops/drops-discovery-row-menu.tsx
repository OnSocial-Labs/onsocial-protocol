'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BookmarkFillIcon,
  BookmarkIcon,
  DotsVerticalIcon,
  EditPenIcon,
  GiftIcon,
  InformationCircleIcon,
  PauseFillIcon,
  PlayFillIcon,
  ShareIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { DropDeleteConfirmPanel } from '@/components/wallet/drop-delete-confirm-panel';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { CollectionFactsSheet } from '@/features/scarces/collection-facts-sheet';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import {
  canDeleteDrop,
  canPauseDrop,
  canResumeDrop,
  deleteDropCollection,
  pauseDropCollection,
  resumeDropCollection,
} from '@/features/scarces/drop-owner-actions';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { collectionPath } from '@/lib/app-routes';
import { dropDeleteConfirmCopy } from '@/lib/drop-delete-confirm-copy';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { shareUrl } from '@/lib/share-url';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function DropsDiscoveryRowMenu({
  item,
  saved,
  savePending,
  onToggleSave,
  onOwnerManaged,
}: {
  item: DropDiscoveryItem;
  saved: boolean;
  savePending: boolean;
  onToggleSave: () => void;
  /** After pause / resume / delete succeeds — refresh or remove the row. */
  onOwnerManaged?: (change: 'paused' | 'resumed' | 'deleted') => void;
}) {
  const { accountId, isConnected, connect, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const creatorId = item.creatorId.trim();
  const { viewerStanding, isLoading: standingLoading } =
    useViewerRelationship(creatorId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(creatorId);
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ownerPending, setOwnerPending] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [factsView, setFactsView] = useState<CollectionView | null>(
    item.view
  );
  const [factsPending, setFactsPending] = useState(false);

  const isSelf = Boolean(accountId) && accountIdsEqual(accountId!, creatorId);
  const standPending = isStandingPendingForTarget(creatorId);
  const creatorLabel = displayName(
    creatorId,
    item.creatorDisplayName ?? undefined
  );
  const dropTitle = item.title.trim() || 'Drop';
  // Visible sheet title = drop name (no “options”). ⋮ keeps a short a11y label.
  const triggerAriaLabel = `More for ${dropTitle}`;

  const showPause = isSelf && canPauseDrop(item.status);
  const showResume = isSelf && canResumeDrop(item.status);
  const showDelete = isSelf && canDeleteDrop(item.mintedCount, item.status);

  const close = useCallback(() => {
    setOpen(false);
    setConfirmDelete(false);
  }, []);

  const openFacts = useCallback(async () => {
    close();
    const cached = factsView ?? item.view;
    if (cached) {
      setFactsView(cached);
      setFactsOpen(true);
      return;
    }
    if (factsPending) return;
    setFactsPending(true);
    try {
      const view = await fetchCollectionPreferIndexer(item.collectionId);
      if (!view) {
        setTxResult({
          type: 'error',
          msg: 'Couldn’t load drop facts.',
        });
        return;
      }
      setFactsView(view);
      setFactsOpen(true);
    } catch (error) {
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : 'Couldn’t load drop facts.',
      });
    } finally {
      setFactsPending(false);
    }
  }, [
    close,
    factsPending,
    factsView,
    item.collectionId,
    item.view,
    setTxResult,
  ]);

  const dropAbsoluteUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${collectionPath(item.collectionId)}`;
  }, [item.collectionId]);

  const handleShare = useCallback(async () => {
    const url = dropAbsoluteUrl();
    const title = item.title.trim() || 'Drop';
    const result = await shareUrl({
      url,
      title,
      text: `Mint ${title} on OnSocial`,
    });
    close();
    if (result === 'copied') {
      setTxResult({ type: 'success', msg: 'Link copied.' });
    } else if (result === 'failed') {
      setTxResult({ type: 'error', msg: 'Couldn’t share this drop.' });
    }
  }, [close, dropAbsoluteUrl, item.title, setTxResult]);

  const handleShareToPost = useCallback(() => {
    if (!isConnected) {
      void connect();
      return;
    }
    requestDropCompose({
      collectionId: item.collectionId,
      title: item.title.trim() || item.collectionId,
      ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
      ...(item.mediumKind ? { mediumKind: item.mediumKind } : {}),
    });
    close();
  }, [
    close,
    connect,
    isConnected,
    item.collectionId,
    item.mediaUrl,
    item.mediumKind,
    item.title,
  ]);

  const runOwnerAction = useCallback(
    async (kind: 'paused' | 'resumed' | 'deleted') => {
      if (!isConnected || ownerPending) return;
      if (kind !== 'deleted') close();
      setOwnerPending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const response =
          kind === 'paused'
            ? await pauseDropCollection(signerId, wallet, item.collectionId)
            : kind === 'resumed'
              ? await resumeDropCollection(signerId, wallet, item.collectionId)
              : await deleteDropCollection(signerId, wallet, item.collectionId);
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
          onOwnerManaged?.(kind);
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
      getSigningWallet,
      isConnected,
      item.collectionId,
      onOwnerManaged,
      ownerPending,
      setTxResult,
      trackTransaction,
    ]
  );

  const handleStand = useCallback(async () => {
    if (!isConnected) {
      void connect();
      return;
    }
    if (isSelf || standPending || standingLoading) return;
    if (isBlockEitherWay(creatorId)) return;
    const next = !viewerStanding;
    try {
      await updateStanding(
        {
          accountId: creatorId,
          name: item.creatorDisplayName ?? null,
          avatarUrl: item.creatorAvatarUrl ?? null,
          bio: null,
        },
        next
      );
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error ? error.message : 'Could not update standing.',
      });
    } finally {
      close();
    }
  }, [
    close,
    connect,
    creatorId,
    isConnected,
    isSelf,
    item.creatorAvatarUrl,
    item.creatorDisplayName,
    setTxResult,
    standPending,
    standingLoading,
    updateStanding,
    viewerStanding,
  ]);

  const items = useMemo<ActionDrawerItem[]>(() => {
    const list: ActionDrawerItem[] = [
      {
        id: 'save',
        section: 'Drop',
        label: savePending
          ? saved
            ? 'Removing…'
            : 'Saving…'
          : saved
            ? 'Remove bookmark'
            : 'Save drop',
        description: saved ? undefined : 'Bookmark for later',
        disabled: savePending,
        leading: saved ? (
          <BookmarkFillIcon className="os-action-drawer-icon" aria-hidden />
        ) : (
          <BookmarkIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          onToggleSave();
          close();
        },
      },
      {
        id: 'share',
        section: 'Drop',
        label: 'Share drop',
        description: 'Copy or send the link',
        leading: <ShareIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void handleShare();
        },
      },
      {
        id: 'share-to-post',
        section: 'Drop',
        label: 'Share to post',
        description: 'Open composer with this drop',
        leading: <EditPenIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: handleShareToPost,
      },
      {
        id: 'facts',
        section: 'Drop',
        label: factsPending ? 'Loading facts…' : 'Drop facts',
        description: 'Mint rules, schedule, provenance',
        disabled: factsPending,
        leading: (
          <InformationCircleIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          void openFacts();
        },
      },
    ];

    if (showPause) {
      list.push({
        id: 'pause',
        section: 'Manage',
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
        section: 'Manage',
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
        section: 'Manage',
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

    if (!isSelf) {
      list.push({
        id: 'stand',
        section: creatorLabel,
        label: standPending
          ? viewerStanding
            ? 'Stepping back…'
            : 'Standing…'
          : viewerStanding
            ? 'Step back'
            : 'Stand with',
        disabled:
          standPending || standingLoading || isBlockEitherWay(creatorId),
        leading: viewerStanding ? (
          <UserMinusIcon className="os-action-drawer-icon" aria-hidden />
        ) : (
          <UserPlusIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          void handleStand();
        },
      });
      list.push({
        id: 'support',
        section: creatorLabel,
        label: 'Support',
        description: 'Send SOCIAL',
        leading: <GiftIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          if (!isConnected) {
            void connect();
            return;
          }
          setSupportOpen(true);
          close();
        },
      });
    }

    return list;
  }, [
    close,
    connect,
    creatorId,
    creatorLabel,
    factsPending,
    handleShare,
    handleShareToPost,
    handleStand,
    isConnected,
    isSelf,
    onToggleSave,
    openFacts,
    ownerPending,
    runOwnerAction,
    savePending,
    saved,
    showDelete,
    showPause,
    showResume,
    standPending,
    standingLoading,
    viewerStanding,
  ]);

  const deleteConfirm = dropDeleteConfirmCopy({ title: dropTitle });
  const factsNowMs = Date.now();
  const sheetView = factsView ?? item.view;

  return (
    <div
      className={`drops-discovery-row-menu post-card-menu${
        open ? ' is-open' : ''
      }`}
    >
      <button
        type="button"
        className={`post-card-menu-trigger${open ? ' is-open' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setConfirmDelete(false);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerAriaLabel}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>

      <ActionDrawer
        open={open}
        onClose={confirmDelete ? () => setConfirmDelete(false) : close}
        label={confirmDelete ? deleteConfirm.title : dropTitle}
        copy={confirmDelete ? undefined : `@${fallbackLabel(creatorId)}`}
        listAriaLabel={
          confirmDelete
            ? `Confirm delete ${dropTitle}`
            : `Actions for ${dropTitle}`
        }
        closeAriaLabel={confirmDelete ? 'Back to drop options' : 'Close'}
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

      {sheetView ? (
        <CollectionFactsSheet
          open={factsOpen}
          onClose={() => setFactsOpen(false)}
          view={sheetView}
          nowMs={factsNowMs}
        />
      ) : null}

      {!isSelf ? (
        <ProfileSupportSheet
          open={supportOpen}
          pageAccountId={creatorId}
          profileName={item.creatorDisplayName}
          avatarUrl={item.creatorAvatarUrl}
          onOpenChange={setSupportOpen}
        />
      ) : null}
    </div>
  );
}
