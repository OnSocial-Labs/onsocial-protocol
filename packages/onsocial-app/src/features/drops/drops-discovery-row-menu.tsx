'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BookmarkFillIcon,
  BookmarkIcon,
  DotsVerticalIcon,
  EditPenIcon,
  GiftIcon,
  ShareIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { collectionPath } from '@/lib/app-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { shareUrl } from '@/lib/share-url';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';

export function DropsDiscoveryRowMenu({
  item,
  saved,
  savePending,
  onToggleSave,
}: {
  item: DropDiscoveryItem;
  saved: boolean;
  savePending: boolean;
  onToggleSave: () => void;
}) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const creatorId = item.creatorId.trim();
  const { viewerStanding, isLoading: standingLoading } =
    useViewerRelationship(creatorId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(creatorId);
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const isSelf =
    Boolean(accountId) && accountIdsEqual(accountId!, creatorId);
  const standPending = isStandingPendingForTarget(creatorId);
  const creatorLabel = displayName(
    creatorId,
    item.creatorDisplayName ?? undefined
  );
  const menuLabel = `${item.title.trim() || 'Drop'} options`;

  const close = useCallback(() => setOpen(false), []);

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
          error instanceof Error
            ? error.message
            : 'Could not update standing.',
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
        label: savePending
          ? saved
            ? 'Removing…'
            : 'Saving…'
          : saved
            ? 'Saved'
            : 'Save drop',
        description: saved ? 'Remove bookmark' : 'Bookmark for later',
        disabled: savePending,
        leading: saved ? (
          <BookmarkFillIcon className="action-drawer-icon" aria-hidden />
        ) : (
          <BookmarkIcon className="action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          onToggleSave();
          close();
        },
      },
      {
        id: 'share',
        label: 'Share drop',
        leading: <ShareIcon className="action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void handleShare();
        },
      },
      {
        id: 'share-to-post',
        label: 'Share to post',
        description: 'Open composer with this drop',
        leading: <EditPenIcon className="action-drawer-icon" aria-hidden />,
        onSelect: handleShareToPost,
      },
    ];

    if (!isSelf) {
      list.push({
        id: 'stand',
        label: standPending
          ? viewerStanding
            ? 'Stepping back…'
            : 'Standing…'
          : viewerStanding
            ? 'Step back'
            : 'Stand with',
        description: creatorLabel,
        disabled:
          standPending || standingLoading || isBlockEitherWay(creatorId),
        leading: viewerStanding ? (
          <UserMinusIcon className="action-drawer-icon" aria-hidden />
        ) : (
          <UserPlusIcon className="action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          void handleStand();
        },
      });
      list.push({
        id: 'support',
        label: 'Support',
        description: creatorLabel,
        leading: <GiftIcon className="action-drawer-icon" aria-hidden />,
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
    handleShare,
    handleShareToPost,
    handleStand,
    isConnected,
    isSelf,
    onToggleSave,
    savePending,
    saved,
    standPending,
    standingLoading,
    viewerStanding,
  ]);

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
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={menuLabel}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>

      <ActionDrawer
        open={open}
        onClose={close}
        label={menuLabel}
        copy={fallbackLabel(creatorId)}
        listAriaLabel={menuLabel}
        closeAriaLabel="Close drop options"
        items={items}
      />

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
