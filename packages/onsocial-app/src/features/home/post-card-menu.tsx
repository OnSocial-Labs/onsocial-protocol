'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import {
  CopyIcon,
  DotsVerticalIcon,
  DownloadIcon,
  EditPenIcon,
  GiftIcon,
  NoteTextIcon,
  TrashIcon,
  UserCheckIcon,
  UserCrossIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  VolumeMuteIcon,
  VolumeUpIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { BlockConfirmPanel } from '@/components/wallet/block-confirm-panel';
import { EndorseComposeSheet } from '@/components/panels/endorse-compose-sheet';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import {
  BLOCK_ACTION_DESCRIPTION,
  MUTE_ACTION_DESCRIPTION,
  blockConfirmCopy,
} from '@/lib/block-confirm-copy';
import { displayName } from '@/lib/profile-display';
import { isDownloadAbort } from '@/lib/media-download';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioPath } from '@/lib/overlay-routes';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { useViewerBlock } from '@/hooks/use-viewer-block';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';

/** Identity + cancel-scarce wiring every menu on the card shares. */
export type PostCardMenuPostProps = {
  href?: string;
  accountId: string;
  authorProfile?: PostAuthorProfile;
  canCancelScarce?: boolean;
  onCancelScarce?: () => void;
  cancelScarcePending?: boolean;
};

export type PostCardMenuProps = PostCardMenuPostProps & {
  /** Thread page — enlarge ⋯ “Open post”. */
  openPostHref?: string;
  onOpenPost?: () => void;
  onDownload?: () => void | Promise<void>;
  onMenuOpen?: () => void;
  zIndex?: number;
};

export const PostCardMenu = memo(function PostCardMenu({
  href,
  openPostHref,
  onOpenPost,
  onDownload,
  accountId,
  authorProfile,
  canCancelScarce = false,
  onCancelScarce,
  cancelScarcePending = false,
  onMenuOpen,
  zIndex,
}: PostCardMenuProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  // Arm relationship fetch only after the menu opens — avoids N fetches per feed.
  const [gesturesArmed, setGesturesArmed] = useState(false);
  const relationshipAccountId = gesturesArmed ? accountId : '';
  const { viewerStanding, viewerEndorsed, isLoading } = useViewerRelationship(
    relationshipAccountId
  );
  const { updateStanding, isStandingPendingForTarget } = useViewerStanding(
    relationshipAccountId || accountId
  );
  const { isEndorsePendingForTarget } = useViewerEndorsement(
    relationshipAccountId || accountId
  );
  const { updateMute, isMuting, isMutePendingForTarget } = useViewerMute();
  const { updateBlock, isBlocking, isBlockPendingForTarget } = useViewerBlock();
  const [supportOpen, setSupportOpen] = useState(false);
  const [endorseOpen, setEndorseOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isOpen = open && !closing;
  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);
  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
    setConfirmBlock(false);
  }, []);
  const close = requestClose;
  const authorLabel = displayName(accountId, authorProfile?.displayName);

  const isSelf =
    Boolean(viewerAccountId) && accountIdsEqual(viewerAccountId!, accountId);
  const showGestures = isConnected && !isSelf;
  const showCancelScarce =
    isConnected && isSelf && canCancelScarce && onCancelScarce;
  const pending = isStandingPendingForTarget(accountId);
  const endorsePending = isEndorsePendingForTarget(accountId);
  const profileHref = portfolioPath(accountId);

  const copyLink = async () => {
    if (!href || typeof window === 'undefined') return;
    const url = new URL(href, window.location.origin).toString();
    try {
      if (!document.hasFocus()) window.focus?.();
      if (document.hasFocus()) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Clipboard can fail when unfocused or insecure — still close the menu.
    }
    close();
  };

  async function handleDownload() {
    if (!onDownload || downloading) return;
    setDownloading(true);
    try {
      await onDownload();
      requestClose();
    } catch (error) {
      if (isDownloadAbort(error)) return;
      setTxResult({
        type: 'error',
        msg: 'Could not download this file.',
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleStandToggle() {
    if (pending || isLoading || !gesturesArmed) return;
    if (isBlockEitherWay(accountId)) {
      setTxResult({
        type: 'error',
        msg: 'Standing is unavailable while a block is in place.',
      });
      close();
      return;
    }
    try {
      await updateStanding(
        {
          accountId,
          name: authorProfile?.displayName?.trim() || null,
          bio: null,
          avatarUrl: authorProfile?.avatarUrl ?? null,
        },
        !viewerStanding
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
  }

  async function handleMuteToggle() {
    if (isMutePendingForTarget(accountId)) return;
    const next = !isMuting(accountId);
    try {
      await updateMute(accountId, next);
      setTxResult({
        type: 'success',
        msg: next ? txToastSuccess.accountMuted : txToastSuccess.accountUnmuted,
      });
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : next
              ? txToastError.muteAccountFailed
              : txToastError.unmuteAccountFailed,
      });
    } finally {
      close();
    }
  }

  async function handleBlockToggle(shouldBlock: boolean) {
    if (isBlockPendingForTarget(accountId)) return;
    try {
      await updateBlock(accountId, shouldBlock);
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : shouldBlock
              ? txToastError.blockAccountFailed
              : txToastError.unblockAccountFailed,
      });
    } finally {
      setConfirmBlock(false);
      close();
    }
  }

  const standLabel = isLoading
    ? '…'
    : pending
      ? viewerStanding
        ? 'Stepping back…'
        : 'Standing…'
      : viewerStanding
        ? 'Step back'
        : 'Stand with';

  const endorseLabel = isLoading
    ? '…'
    : endorsePending
      ? viewerEndorsed
        ? 'Updating…'
        : 'Endorsing…'
      : viewerEndorsed
        ? 'Edit endorsement'
        : 'Endorse';

  const muted = isMuting(accountId);
  const blocked = isBlocking(accountId);
  const mutePending = isMutePendingForTarget(accountId);
  const blockPending = isBlockPendingForTarget(accountId);

  const menuItems = useMemo<ActionDrawerItem[]>(() => {
    const items: ActionDrawerItem[] = [];
    if (openPostHref) {
      items.push({
        id: 'open-post',
        label: 'Open post',
        href: openPostHref,
        leading: <NoteTextIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          onOpenPost?.();
          requestClose();
        },
      });
    }
    if (showGestures) {
      items.push({
        id: 'stand',
        label: standLabel,
        disabled: pending || isLoading || isBlockEitherWay(accountId),
        leading: viewerStanding ? (
          <UserMinusIcon className="os-action-drawer-icon" aria-hidden />
        ) : (
          <UserPlusIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => void handleStandToggle(),
      });
      items.push({
        id: 'support',
        label: 'Support',
        leading: <GiftIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          setSupportOpen(true);
          requestClose();
        },
      });
      items.push({
        id: 'endorse',
        label: endorseLabel,
        disabled: endorsePending || isLoading,
        leading: viewerEndorsed ? (
          <EditPenIcon className="os-action-drawer-icon" aria-hidden />
        ) : (
          <UserCheckIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          if (isBlockEitherWay(accountId)) {
            setTxResult({
              type: 'error',
              msg: 'Endorsement is unavailable while a block is in place.',
            });
            requestClose();
            return;
          }
          setEndorseOpen(true);
          requestClose();
        },
      });
      items.push({
        id: 'mute',
        label: mutePending
          ? muted
            ? 'Unmuting…'
            : 'Muting…'
          : muted
            ? 'Unmute'
            : 'Mute',
        description: muted ? undefined : MUTE_ACTION_DESCRIPTION,
        disabled: mutePending,
        leading: muted ? (
          <VolumeUpIcon className="os-action-drawer-icon" aria-hidden />
        ) : (
          <VolumeMuteIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => void handleMuteToggle(),
      });
      items.push({
        id: 'block',
        label: blockPending
          ? blocked
            ? 'Unblocking…'
            : 'Blocking…'
          : blocked
            ? 'Unblock'
            : 'Block',
        description: blocked ? undefined : BLOCK_ACTION_DESCRIPTION,
        destructive: !blocked,
        disabled: blockPending,
        leading: (
          <UserCrossIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          if (blocked) {
            void handleBlockToggle(false);
            return;
          }
          setConfirmBlock(true);
        },
      });
    }
    // List is a primary card CTA (Buy · List · Amplify) — keep Cancel
    // in the ⋮ menu for managing an active listing.
    if (showCancelScarce) {
      items.push({
        id: 'cancel-scarce',
        label: cancelScarcePending ? 'Canceling…' : 'Cancel listing',
        destructive: true,
        disabled: cancelScarcePending,
        leading: <TrashIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          requestClose();
          onCancelScarce();
        },
      });
    }
    items.push({
      id: 'view-profile',
      label: 'View profile',
      href: profileHref,
      leading: <UserIcon className="os-action-drawer-icon" aria-hidden />,
      onSelect: () => requestClose(),
    });
    if (href) {
      items.push({
        id: 'copy-link',
        label: 'Copy link',
        leading: <CopyIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => void copyLink(),
      });
    }
    if (onDownload) {
      items.push({
        id: 'download',
        label: downloading ? 'Downloading…' : 'Download',
        disabled: downloading,
        leading: <DownloadIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => void handleDownload(),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showGestures,
    standLabel,
    viewerStanding,
    endorseLabel,
    viewerEndorsed,
    pending,
    endorsePending,
    isLoading,
    muted,
    blocked,
    mutePending,
    blockPending,
    showCancelScarce,
    cancelScarcePending,
    href,
    profileHref,
    openPostHref,
    onDownload,
    downloading,
  ]);

  return (
    <>
      <div className={`post-card-menu${isOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className={`post-card-menu-trigger${isOpen ? ' is-open' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isOpen) {
              if (showGestures) setGesturesArmed(true);
              onMenuOpen?.();
            }
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label="More"
        >
          <DotsVerticalIcon
            className={
              openPostHref ? 'glass-sheet-close-icon' : 'post-card-menu-icon'
            }
            aria-hidden
          />
        </button>

        <ActionDrawer
          open={isOpen}
          onClose={confirmBlock ? () => setConfirmBlock(false) : requestClose}
          onClosed={handleClosed}
          label={
            confirmBlock
              ? blockConfirmCopy({
                  accountId,
                  profileName: authorProfile?.displayName,
                }).title
              : authorLabel
          }
          copy={confirmBlock ? authorLabel : undefined}
          listAriaLabel={authorLabel}
          closeAriaLabel={confirmBlock ? 'Back' : 'Close'}
          items={confirmBlock ? undefined : menuItems}
          {...(zIndex != null ? { zIndex } : {})}
        >
          {confirmBlock ? (
            <BlockConfirmPanel
              accountId={accountId}
              profileName={authorProfile?.displayName}
              pending={blockPending}
              onConfirm={() => void handleBlockToggle(true)}
              onCancel={() => setConfirmBlock(false)}
            />
          ) : null}
        </ActionDrawer>
      </div>
      <EndorseComposeSheet
        open={endorseOpen}
        pageAccountId={accountId}
        profileName={authorProfile?.displayName}
        avatarUrl={authorProfile?.avatarUrl}
        intent={viewerEndorsed ? 'auto' : 'create'}
        onOpenChange={setEndorseOpen}
        {...(zIndex != null ? { zIndex } : {})}
      />
      <ProfileSupportSheet
        open={supportOpen}
        pageAccountId={accountId}
        profileName={authorProfile?.displayName}
        avatarUrl={authorProfile?.avatarUrl}
        onOpenChange={setSupportOpen}
        {...(zIndex != null ? { zIndex } : {})}
      />
    </>
  );
});
