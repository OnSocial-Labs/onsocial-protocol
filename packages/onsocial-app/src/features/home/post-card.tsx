'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import {
  CopyIcon,
  DotsVerticalIcon,
  DownloadIcon,
  EditPenIcon,
  GiftIcon,
  NoteTextIcon,
  RepeatIcon,
  TrashIcon,
  UserCheckIcon,
  UserCrossIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  VolumeMuteIcon,
  VolumeUpIcon,
  UsersFillIcon,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { QuotedPostInset } from '@/features/home/post-card-quote';
import {
  PostEngagementRow,
  PostPeekStandButton,
} from '@/features/home/post-card-engagement';
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
import { downloadIpfsMedia, isDownloadAbort } from '@/lib/media-download';
import { PostAmplifySheet } from '@/features/home/post-amplify-sheet';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { isArticlePost } from '@/lib/article-post-payload';
import { type WriteDockSubmit } from '@/contexts/compose-launcher-context';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { guildPath } from '@/features/guilds/guilds-data';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { WritingReadDocument } from '@/features/scarces/scarce-writing-read-sheet';
import { FeedArticleReadScreen } from '@/features/home/feed-article-read-screen';
import { FeedPhotoEnlargeScreen } from '@/features/home/feed-photo-enlarge-screen';
import { PostMediaStrip } from '@/features/home/post-media';
import { PostPollEmbedCard } from '@/features/home/post-poll-embed';
import { PostRichText } from '@/features/home/post-rich-text';
import { PostSensitiveGate } from '@/features/home/post-sensitive-gate';
import {
  canCancelPostScarce,
  cancelPostScarceListing,
} from '@/features/scarces/cancel-post-scarce';
import { PostScarceCta } from '@/features/scarces/post-scarce-cta';
import {
  isWritingFolioFormat,
  resolveDropReadTarget,
} from '@/features/scarces/drop-writing';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import {
  fetchOwnedScarceByTokenId,
  fetchOwnedScarceForCollection,
  fetchOwnedScarceForSourcePost,
  invalidateLiveListingsCache,
  type OwnedScarceItem,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarceBidSheet } from '@/features/scarces/scarce-bid-sheet';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { ScarceListSheet } from '@/features/scarces/scarce-list-sheet';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { ScarceTransferSheet } from '@/features/scarces/scarce-transfer-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  postScarceAudio,
  postScarceCoverImage,
  ScarcePostPreview,
} from '@/features/scarces/scarce-post-preview';
import {
  postDropIsPlayable,
  postDropIsReadable,
} from '@/features/scarces/post-drop-cta';
import {
  resolveScarceFeedMediumMode,
  ScarceFeedMediumSheet,
  type ScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-sheet';
import { usePostCollectionEmbed } from '@/features/scarces/use-post-collection-embed';
import { usePostScarceEmbed } from '@/features/scarces/use-post-scarce-embed';
import { usePostTokenEmbed } from '@/features/scarces/use-post-token-embed';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { useViewerBlock } from '@/hooks/use-viewer-block';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { parsePostContentLabels } from '@/lib/post-content-labels';
import { accountIdsEqual } from '@/lib/account-match';
import { consumeEssayReopen } from '@/lib/essay-return';
import { portfolioPath, writingArticlePath } from '@/lib/overlay-routes';
import {
  articleTeaseSource,
  parseArticleSnapshot,
  resolveArticleCover,
  resolvePostCardOpenHref,
} from '@/lib/article-post-payload';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { OsTextFold } from '@/components/ui/os-text-fold';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  formatPostTimestamp,
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
  parsePostPollEmbed,
  parsePostText,
  parsePostTokenEmbed,
  postFeedBodyOverflows,
  postFeedPreviewLimit,
  postKey,
  postKindBadge,
  postPreviewNeedsExpand,
  postTimestampIso,
  truncatePostPreview,
} from '@/lib/post-display';
import {
  isRepostRefType,
  postRelationContext,
  formatPostRelationTarget,
  type PostRelationContext,
} from '@/lib/post-relation';
import {
  parsePostMedia,
  isRenderablePostVideo,
  postVisualMedia,
  resolveFeedMediaActivate,
  type PostMediaItem,
} from '@/lib/post-media';
import type { ThreadSheetContext } from '@/lib/guild-thread-card-context';
import { isAppPostSheetHref, postThreadPath } from '@/lib/post-routes';
import type { PollTally } from '@/lib/poll-votes';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import type { PostEngagement } from '@/hooks/use-post-engagement';

interface PostCardProps {
  post: PostRow;
  actionHref?: string;
  authorProfile?: PostAuthorProfile;
  /** Extra classes, e.g. thread chain position modifiers. */
  className?: string;
  /**
   * Repost attribution — the card body IS the original post; this credits
   * the reposter with `You reposted` / `{name} reposted` above the card.
   */
  repostedBy?: { accountId: string; displayName?: string | null };
  /** Compact inset preview of the post this one quotes. */
  quotedPost?: PostRow;
  quotedAuthorProfile?: PostAuthorProfile;
  /** Click-through to the quoted post's own page. */
  quotedHref?: string;
  /** Hide the `Replying to @x` context line (redundant inside thread tabs). */
  showRelationBadge?: boolean;
  /** Profile shells for reply / quote targets (`@{handle}` lines). */
  authorProfiles?: Record<string, PostAuthorProfile>;
  /** Show room under identity (guild “All” / thread root). */
  showChannel?: boolean;
  /** Prefer room title when `channel` is an id. */
  channelLabel?: string;
  /**
   * Mixed feeds (Home / hashtag): muted Users + guild name above the author.
   * Skip inside a guild room where context is already the guild.
   */
  showGuildAttribution?: boolean;
  /** Resolved guild display name when `showGuildAttribution` is on. */
  guildName?: string;
  /**
   * Feed this card was opened from. A guild feed skips the guild line the
   * screen already shows.
   */
  sheetContext?: ThreadSheetContext | null;
  engagement?: PostEngagement;
  reactionPending?: boolean;
  savePending?: boolean;
  sharePending?: boolean;
  onToggleReaction?: (post: PostRow) => void;
  onToggleSave?: (post: PostRow) => void;
  /** Optimistic amplify count / Hot heat after a confirmed spend. */
  onAmplifyConfirmed?: (
    post: PostRow,
    detail: PostAmplifySuccessDetail
  ) => void;
  /** Open a reply composer targeting this post. */
  onReply?: (post: PostRow) => void;
  /** Expand the compact write dock into the full reply composer. */
  onExpandReply?: (post: PostRow, draft: WriteDockSubmit) => void;
  /** Open a quote composer targeting this post. */
  onQuote?: (post: PostRow) => void;
  /** One-tap repost targeting this post. */
  onRepost?: (post: PostRow) => void;
  /** Undo the viewer's existing repost. */
  onUndoRepost?: (post: PostRow) => void;
  pollTally?: PollTally;
  pollVotePending?: boolean;
  onPollVote?: (post: PostRow, optionIndex: number) => void;
  /** Thread root — page-sized focused media playback. */
  mediaFocused?: boolean;
  /** Hide photo / video / cover — used when the film already sits above. */
  hideMedia?: boolean;
  /** Stack the ⋮ menu above a host sheet (media-face thread drawer). */
  menuZIndex?: number;
  /** Detail opened with `?media=unmute` — resume video with sound. */
  mediaUnmuted?: boolean;
  /** Collage tile index to unmute (`?mi=`). */
  mediaResumeIndex?: number;
  /**
   * Open post / thread root: stacked name + @handle, full timestamp under
   * the body above engagement icons.
   */
  detailLayout?: boolean;
  /**
   * Open `actionHref` even for titled articles — thread tail “More from”
   * must not intercept onto Writing over this same conversation.
   */
  preferActionHref?: boolean;
}

function PostCardMenu({
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
}: {
  href?: string;
  /** Thread page — enlarge ⋯ “Open post”. */
  openPostHref?: string;
  onOpenPost?: () => void;
  onDownload?: () => void | Promise<void>;
  accountId: string;
  authorProfile?: PostAuthorProfile;
  canCancelScarce?: boolean;
  onCancelScarce?: () => void;
  cancelScarcePending?: boolean;
  onMenuOpen?: () => void;
  zIndex?: number;
}) {
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
}

function postBadges(
  post: PostRow,
  hasPollEmbed: boolean,
  _hasMediaStrip: boolean
): string[] {
  const badge = postKindBadge(post.kind, hasPollEmbed);
  return badge ? [badge] : [];
}

function PostCardRelationLine({
  relationContext,
  relationTargetProfileName,
}: {
  relationContext: PostRelationContext;
  relationTargetProfileName?: string | null;
}) {
  if (relationContext.kind === 'repost') {
    return (
      <span className="post-card-relation">
        <RepeatIcon className="post-card-relation-icon" aria-hidden />
        {relationContext.label}
      </span>
    );
  }

  const target = formatPostRelationTarget(
    relationContext.handle,
    relationTargetProfileName
  );

  return (
    <span className="post-card-relation">
      {relationContext.verb}{' '}
      <Link
        href={portfolioPath(relationContext.handle)}
        className="os-mention post-card-relation-target"
        scroll={false}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {target.name ? (
          <>
            <span className="post-card-relation-name">{target.name}</span>{' '}
            <span className="post-card-relation-handle">@{target.handle}</span>
          </>
        ) : (
          <span className="post-card-relation-handle">@{target.handle}</span>
        )}
      </Link>
    </span>
  );
}

function PostCardBody({
  relationContext,
  relationTargetProfileName,
  badges,
  text,
  hideText = false,
  hasMedia = false,
  /** Thread focus / detail — show full copy, no Show more. */
  expandDisabled = false,
  articleTitle = null,
  articleHref = null,
  onReadArticle = null,
  onArticleHrefClick = null,
  onArticleHrefNavigate = null,
}: {
  relationContext: PostRelationContext | null;
  relationTargetProfileName?: string | null;
  badges: string[];
  text: string;
  /** When the poll card already shows the question, skip duplicate body text. */
  hideText?: boolean;
  hasMedia?: boolean;
  expandDisabled?: boolean;
  articleTitle?: string | null;
  articleHref?: string | null;
  /** Feed overlay reader — preferred over hard-nav when set. */
  onReadArticle?: (() => void) | null;
  onArticleHrefClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | null;
  onArticleHrefNavigate?: ((event: { preventDefault(): void }) => void) | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [bodyOverflows, setBodyOverflows] = useState(() =>
    postFeedBodyOverflows(text, hasMedia)
  );
  const previewLimit = postFeedPreviewLimit(hasMedia);
  const isArticle = Boolean(articleTitle && articleHref);
  /** Photo posts peek shorter. The full text stays mounted; the clip folds it. */
  const closedLines = hasMedia ? 3 : 6;
  const foldBody =
    !isArticle && !expandDisabled && !hideText && text.trim().length > 0;
  const tease = isArticle
    ? truncatePostPreview(articleTeaseSource(text), previewLimit)
    : text;
  const showArticleRead =
    isArticle &&
    (Boolean(articleHref) || Boolean(onReadArticle)) &&
    (postPreviewNeedsExpand(text, previewLimit) || Boolean(articleTitle));

  const readControl =
    showArticleRead && onReadArticle ? (
      <button
        type="button"
        className="post-card-show-more post-card-show-more--dots"
        aria-label="Read article"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onReadArticle();
        }}
      >
        …
      </button>
    ) : showArticleRead && articleHref ? (
      <Link
        href={articleHref}
        className="post-card-show-more post-card-show-more--dots"
        aria-label="Read article"
        scroll={false}
        onClick={(event) => {
          event.stopPropagation();
          onArticleHrefClick?.(event);
        }}
        onNavigate={onArticleHrefNavigate ?? undefined}
      >
        …
      </Link>
    ) : null;
  // The tease's static trailing ellipsis is replaced by the ellipsis
  // affordance itself, so the dots sit exactly at the truncation point.
  const teaseDisplay = readControl ? tease.replace(/…$/u, '') : tease;

  return (
    <>
      {relationContext ? (
        <PostCardRelationLine
          relationContext={relationContext}
          relationTargetProfileName={relationTargetProfileName}
        />
      ) : null}
      {badges.length > 0 ? (
        <div className="post-card-badges">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      ) : null}
      {articleTitle ? (
        <p className="post-card-article-title">{articleTitle}</p>
      ) : null}
      {!hideText && tease.trim() ? (
        <div className="post-card-body-block">
          {foldBody ? (
            <OsTextFold
              open={expanded}
              closedLines={closedLines}
              capped
              onOverflow={(overflows) => {
                if (overflows) setBodyOverflows(true);
              }}
            >
              <p className="post-card-body">
                <PostRichText text={text} />
              </p>
            </OsTextFold>
          ) : (
            <p className="post-card-body">
              <PostRichText text={teaseDisplay} inlineMarks={isArticle} />
              {readControl}
            </p>
          )}
          {foldBody && bodyOverflows ? (
            <button
              type="button"
              className={`post-card-show-more${
                expanded
                  ? ''
                  : ' post-card-show-more--fold post-card-show-more--dots'
              }`}
              aria-expanded={expanded}
              aria-label={expanded ? 'Show less' : 'Show more'}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
            >
              {expanded ? 'Show less' : '…'}
            </button>
          ) : null}
        </div>
      ) : readControl ? (
        <div className="post-card-body-block">{readControl}</div>
      ) : null}
    </>
  );
}

export {
  HOME_FEED_APPEND_SKELETON_FRAMES,
  HOME_FEED_COLD_SKELETON_FRAMES,
  PostRowSkeleton,
} from '@/features/home/post-skeleton';
export type { PostSkeletonFrame } from '@/features/home/post-skeleton';

function PostCardImpl({
  post,
  actionHref,
  authorProfile,
  className,
  repostedBy,
  quotedPost,
  quotedAuthorProfile,
  quotedHref,
  showRelationBadge = true,
  authorProfiles,
  showChannel = false,
  channelLabel,
  showGuildAttribution = false,
  guildName,
  engagement,
  reactionPending,
  savePending,
  sharePending,
  onToggleReaction,
  onToggleSave,
  onAmplifyConfirmed,
  onReply,
  onQuote,
  onRepost,
  onUndoRepost,
  pollTally,
  pollVotePending,
  onPollVote,
  mediaFocused = false,
  hideMedia = false,
  menuZIndex,
  mediaUnmuted = false,
  mediaResumeIndex = 0,
  detailLayout = false,
  preferActionHref = false,
  sheetContext = null,
}: PostCardProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const { openPostThread } = usePostThreadLayer();
  const interceptOpenHref = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string) => {
      if (detailLayout) return;
      if (!isUnmodifiedPrimaryClick(event)) return;
      if (!isAppPostSheetHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      openPostThread({ href, root: post, context: sheetContext });
    },
    [detailLayout, openPostThread, post, sheetContext]
  );
  const interceptOpenNavigate = useCallback(
    (event: { preventDefault(): void }, href: string) => {
      if (detailLayout) return;
      if (!isAppPostSheetHref(href)) return;
      event.preventDefault();
      openPostThread({ href, root: post, context: sheetContext });
    },
    [detailLayout, openPostThread, post, sheetContext]
  );
  const { safeMode } = useViewerSafeMode();
  const [amplifyOpen, setAmplifyOpen] = useState(false);
  const [listScarceOpen, setListScarceOpen] = useState(false);
  const [buyScarceOpen, setBuyScarceOpen] = useState(false);
  const [bidScarceOpen, setBidScarceOpen] = useState(false);
  const [sellScarceOpen, setSellScarceOpen] = useState(false);
  const [transferScarceOpen, setTransferScarceOpen] = useState(false);
  const [ownedScarceByKey, setOwnedScarceByKey] = useState<{
    key: string;
    item: OwnedScarceItem | null;
  } | null>(null);
  const [feedMediumOpen, setFeedMediumOpen] = useState(false);
  const [feedMediumMode, setFeedMediumMode] =
    useState<ScarceFeedMediumMode>('viewer');
  const [feedMediumCoverSvg, setFeedMediumCoverSvg] = useState<string | null>(
    null
  );
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  /** Mood / craft article — slide-over reader (stays on feed). */
  const [articleOpen, setArticleOpen] = useState(false);
  /** Shared drop whose essay lives on another post. */
  const [feedReadEssay, setFeedReadEssay] = useState<PostRow | null>(null);
  const [feedBookRead, setFeedBookRead] = useState(false);
  const [feedBookCoverSvg, setFeedBookCoverSvg] = useState<string | null>(null);
  const feedReadAuthors = usePostAuthorProfiles(
    feedReadEssay ? [feedReadEssay.accountId] : []
  );
  const dropReadTicket = useRef(0);
  /** Article cover still when it isn’t already in post media. */
  const [enlargeOverride, setEnlargeOverride] = useState<
    PostMediaItem[] | null
  >(null);
  /** Reply on an open photo, drop, player, or writing — same thread drawer. */
  const [photoThreadOpen, setPhotoThreadOpen] = useState(false);
  const openPhotoThread = useCallback(() => {
    setPhotoThreadOpen(true);
  }, []);
  const dismissPhotoThread = useCallback(() => {
    setPhotoThreadOpen(false);
  }, []);
  const [menuForceEmbed, setMenuForceEmbed] = useState(false);
  const [cancelScarcePending, setCancelScarcePending] = useState(false);
  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, post.accountId);
  const hasCollectionEmbed = Boolean(parsePostCollectionEmbed(post.value));
  const hasTokenEmbed = Boolean(parsePostTokenEmbed(post.value));
  const {
    rootRef: collectionEmbedRef,
    embed: collectionEmbed,
    playables: collectionPlayables,
    readables: collectionReadables,
    writingFormat: collectionWritingFormat,
    sourcePostPath: collectionSourcePostPath,
    writingMetaSettled: collectionWritingSettled,
    bookPdf: collectionBookPdf,
    dropTitle: collectionDropTitle,
    retry: retryCollectionEmbed,
  } = usePostCollectionEmbed(post, {
    force: isSelf || menuForceEmbed,
  });
  // Token resale announce — mutually exclusive with collection + fromPost.
  const {
    rootRef: tokenEmbedRef,
    embed: tokenEmbed,
    dropTitle: tokenDropTitle,
    retry: retryTokenEmbed,
  } = usePostTokenEmbed(post, {
    enabled: !hasCollectionEmbed,
    force: isSelf || menuForceEmbed,
  });
  // Own posts: fetch embed immediately so ⋮ already knows list vs cancel.
  // Skip fromPost resolve when this post is a Drop / token reference embed.
  const {
    rootRef: scarceEmbedRef,
    embed: fromPostScarceEmbed,
    retry: retryFromPostScarceEmbed,
  } = usePostScarceEmbed(post, {
    enabled: !hasCollectionEmbed && !hasTokenEmbed,
    force: isSelf || menuForceEmbed,
  });
  const scarceEmbed = collectionEmbed ?? tokenEmbed ?? fromPostScarceEmbed;
  const scarceEmbedMergedRef = (node: HTMLElement | null) => {
    scarceEmbedRef.current = node;
    collectionEmbedRef.current = node;
    tokenEmbedRef.current = node;
  };
  const retryScarceEmbed = () => {
    retryCollectionEmbed();
    retryTokenEmbed();
    retryFromPostScarceEmbed();
  };
  const sourcePostPath = `${post.accountId}/post/${post.postId}`;
  const scarceTokenId = scarceEmbed?.tokenId?.trim() || '';
  const scarceCollectionId =
    scarceEmbed?.collectionId?.trim() ||
    scarceEmbed?.latest?.collectionId?.trim() ||
    '';
  const ownershipKey =
    viewerAccountId &&
    scarceEmbed &&
    scarceEmbed.status !== 'none' &&
    (scarceTokenId || scarceCollectionId || sourcePostPath)
      ? `${viewerAccountId}|${sourcePostPath}|${scarceTokenId}|${scarceCollectionId}`
      : null;

  // Resolve owned edition so holders can Sell from the post (same as Mines).
  useEffect(() => {
    if (!ownershipKey || !viewerAccountId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let item: OwnedScarceItem | null = null;
        if (scarceTokenId) {
          item = await fetchOwnedScarceByTokenId(
            viewerAccountId,
            scarceTokenId
          );
        }
        if (!item && scarceCollectionId) {
          item = await fetchOwnedScarceForCollection(
            viewerAccountId,
            scarceCollectionId
          );
        }
        if (!item) {
          item = await fetchOwnedScarceForSourcePost(
            viewerAccountId,
            sourcePostPath
          );
        }
        if (!cancelled) setOwnedScarceByKey({ key: ownershipKey, item });
      } catch {
        if (!cancelled) setOwnedScarceByKey({ key: ownershipKey, item: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    ownershipKey,
    viewerAccountId,
    scarceTokenId,
    scarceCollectionId,
    sourcePostPath,
  ]);

  const ownedScarceItem =
    ownershipKey && ownedScarceByKey?.key === ownershipKey
      ? ownedScarceByKey.item
      : null;
  const canSellScarce =
    isConnected &&
    ownedScarceItem != null &&
    ownedScarceItem.listingKind == null;
  const canTransferScarce =
    isConnected &&
    ownedScarceItem != null &&
    ownedScarceCanTransfer(ownedScarceItem);
  const sellListedScarce =
    isConnected &&
    ownedScarceItem != null &&
    ownedScarceItem.listingKind != null;

  const refreshOwnedScarce = useCallback(() => {
    if (!ownershipKey || !viewerAccountId) return;
    void (async () => {
      let item: OwnedScarceItem | null = null;
      if (scarceTokenId) {
        item = await fetchOwnedScarceByTokenId(viewerAccountId, scarceTokenId);
      }
      if (!item && scarceCollectionId) {
        item = await fetchOwnedScarceForCollection(
          viewerAccountId,
          scarceCollectionId
        );
      }
      if (!item) {
        item = await fetchOwnedScarceForSourcePost(
          viewerAccountId,
          sourcePostPath
        );
      }
      setOwnedScarceByKey({ key: ownershipKey, item });
    })();
  }, [
    ownershipKey,
    viewerAccountId,
    scarceTokenId,
    scarceCollectionId,
    sourcePostPath,
  ]);

  const activelyListed =
    scarceEmbed?.status === 'lazy_listing' ||
    scarceEmbed?.status === 'listed' ||
    scarceEmbed?.status === 'auction';
  // Show List as soon as we don't know of an active listing. Waiting on
  // `ready` made the menu feel broken on own posts while indexer/contract
  // checks ran. Optimistic ledger + reconcile still flip to Cancel once
  // a listing is confirmed. Collection-reference posts are not listable
  // from the post (they point at an existing Drop / edition).
  const isRepostShell = isRepostRefType(post.refType);
  const canListScarce =
    isConnected &&
    isSelf &&
    !isRepostShell &&
    !hasCollectionEmbed &&
    !activelyListed;
  const canCancelScarce =
    isConnected &&
    isSelf &&
    !isRepostShell &&
    !hasCollectionEmbed &&
    canCancelPostScarce(scarceEmbed);

  async function handleCancelScarce() {
    if (!scarceEmbed || cancelScarcePending) return;
    setCancelScarcePending(true);
    try {
      const { accountId, wallet } = await getClient();
      const response = await cancelPostScarceListing(
        accountId,
        wallet,
        scarceEmbed
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.cancelingScarceListing,
        successMessage: txToastSuccess.scarceListingCanceled,
        failureMessage: txToastError.cancelScarceListingFailed,
      });
      if (!confirmed) return;
      invalidateLiveListingsCache(post.accountId);
      setScarceEmbedOverride(postScarceKey(post.accountId, post.postId), {
        status: 'none',
        events: [],
      });
      retryScarceEmbed();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.cancelScarceListingFailed,
      });
    } finally {
      setCancelScarcePending(false);
    }
  }

  const text = parsePostText(post.value);
  const article = parseArticleSnapshot(post.value);
  useEffect(() => {
    if (!article) return;
    if (consumeEssayReopen(post.accountId, post.postId)) {
      setFeedReadEssay(null);
      setFeedBookRead(false);
      setArticleOpen(true);
    }
  }, [article, post.accountId, post.postId]);
  const articleHref = article
    ? writingArticlePath(post.accountId, post.postId)
    : null;
  const openHref = resolvePostCardOpenHref({
    articleHref,
    actionHref,
    detailLayout,
    preferActionHref,
  });
  const readHref = preferActionHref ? openHref : articleHref;
  const labels = parsePostContentLabels(post.value);
  const poll = parsePostPollEmbed(post.value);
  const dropPaint = parseDropPaintSnapshot(post.value);
  const mediaItems = parsePostMedia(post.value);
  const hasMedia = mediaItems.length > 0;
  const visualMedia = postVisualMedia(mediaItems);
  const enlargePhotos = enlargeOverride ?? visualMedia;
  const enlargeHasVideo = enlargePhotos.some((item) =>
    isRenderablePostVideo(item)
  );
  const enlargeHasPhoto = enlargePhotos.some(
    (item) => !isRenderablePostVideo(item)
  );
  const enlargeTitle =
    enlargeHasVideo && enlargeHasPhoto
      ? 'Media'
      : enlargeHasVideo
        ? 'Video'
        : 'Photo';
  const photoCaption = text.trim() || null;
  const photoCover = postScarceCoverImage(post);
  const scarceCoverUrl =
    scarceEmbed?.mediaUrl?.trim() || dropPaint?.mediaUrl?.trim() || null;
  const articleCover = article
    ? resolveArticleCover({
        value: post.value,
        scarceMediaUrl: scarceCoverUrl,
        scarceCardBg: scarceEmbed?.cardBg ?? null,
      })
    : null;
  const showScarceArt =
    !article &&
    !photoCover &&
    Boolean(scarceEmbed) &&
    (scarceEmbed?.status === 'lazy_listing' ||
      scarceEmbed?.status === 'drop' ||
      scarceEmbed?.status === 'listed' ||
      scarceEmbed?.status === 'sold' ||
      scarceEmbed?.status === 'auction' ||
      scarceEmbed?.status === 'minted');
  const articleIssuedAt =
    typeof post.blockTimestamp === 'number'
      ? post.blockTimestamp
      : Number(post.blockTimestamp) || 0;
  const postAudio = postScarceAudio(post);
  const postPlayables: ScarcePlayableMedia[] = postAudio?.url
    ? [
        {
          url: postAudio.url,
          mime: postAudio.mime || 'audio/mpeg',
          ...(postAudio.cid ? { cid: postAudio.cid } : {}),
        },
      ]
    : [];
  const listenPlayables =
    collectionPlayables.length > 0 ? collectionPlayables : postPlayables;
  const canHydrateAudio =
    Boolean(scarceEmbed?.collectionId?.trim()) ||
    Boolean(scarceEmbed?.tokenId?.trim());
  const showDropListen =
    listenPlayables.length > 0 ||
    (postDropIsPlayable(scarceEmbed) && canHydrateAudio);
  const showDropRead =
    collectionReadables.length > 0 ||
    Boolean(collectionBookPdf) ||
    (postDropIsReadable(scarceEmbed) &&
      Boolean(scarceEmbed?.collectionId?.trim()));
  const dropListenTitle =
    tokenDropTitle?.trim() ||
    collectionDropTitle?.trim() ||
    dropPaint?.title?.trim() ||
    'Drop';
  const openFeedMedium = (
    mode: ScarceFeedMediumMode,
    coverSvg: string | null = null
  ) => {
    setFeedMediumMode(mode);
    setFeedMediumCoverSvg(coverSvg);
    setFeedMediumOpen(true);
  };
  /** Listed writing Drop face — cover stays card-sized. */
  const articleHasScarceFace =
    Boolean(article) &&
    Boolean(scarceEmbed) &&
    (scarceEmbed?.status === 'lazy_listing' ||
      scarceEmbed?.status === 'drop' ||
      scarceEmbed?.status === 'listed' ||
      scarceEmbed?.status === 'sold' ||
      scarceEmbed?.status === 'auction' ||
      scarceEmbed?.status === 'minted');
  const articleUsesDocumentReader =
    Boolean(article) && !isWritingFolioFormat(collectionWritingFormat);
  /**
   * Read and the drop cover, from the feed:
   * the post reader, with this post's controls.
   * - Essay on this post → that essay
   * - Shared listed article → that essay, this post's footer
   * - Book / Issue → those pages, this post's footer
   * The drop page keeps its own reader.
   */
  const openFeedPostReader = (next?: {
    essay?: PostRow | null;
    book?: boolean;
    coverSvg?: string | null;
  }) => {
    setFeedReadEssay(next?.essay ?? null);
    setFeedBookRead(Boolean(next?.book));
    setFeedBookCoverSvg(next?.coverSvg ?? null);
    setArticleOpen(true);
  };
  const openDropWriting = (coverSvg: string | null = null) => {
    const ticket = ++dropReadTicket.current;
    const paintSource = dropPaint?.sourcePostPath ?? null;
    const openResolved = (
      writingFormat: typeof collectionWritingFormat,
      sourcePostPath: string | null
    ) => {
      if (ticket !== dropReadTicket.current) return;
      const target = resolveDropReadTarget({
        articleOnPost: Boolean(article),
        writingFormat,
        sourcePostPath,
      });
      if (target.kind === 'self') {
        openFeedPostReader();
        return;
      }
      if (target.kind === 'folio') {
        openFeedPostReader({ book: true, coverSvg });
        return;
      }
      void (async () => {
        try {
          const essay = await fetchPersonalPost({
            author: target.author,
            postId: target.postId,
          });
          if (ticket !== dropReadTicket.current) return;
          if (essay && isArticlePost(essay)) {
            openFeedPostReader({ essay });
            return;
          }
        } catch {
          /* book pages below */
        }
        if (ticket !== dropReadTicket.current) return;
        openFeedPostReader({ book: true, coverSvg });
      })();
    };

    if (article && !isWritingFolioFormat(collectionWritingFormat)) {
      openFeedPostReader();
      return;
    }

    const collectionId = scarceEmbed?.collectionId?.trim() || '';
    if (collectionWritingSettled || !collectionId) {
      openResolved(
        collectionWritingFormat,
        collectionWritingSettled
          ? (collectionSourcePostPath ?? paintSource)
          : paintSource
      );
      return;
    }

    void fetchCollectionPreferIndexer(collectionId)
      .then((view) => {
        openResolved(
          view?.writingFormat ?? null,
          view?.sourcePostPath ?? paintSource
        );
      })
      .catch(() => {
        openResolved(collectionWritingFormat, paintSource);
      });
  };
  const activateArticleCover = () => {
    if (articleUsesDocumentReader) {
      openFeedPostReader();
      return;
    }
    if (articleHasScarceFace) {
      const mode = resolveScarceFeedMediumMode(
        scarceEmbed?.mediumKind ?? dropPaint?.mediumKind
      );
      if (mode === 'audio') {
        openFeedMedium('audio');
        return;
      }
      openDropWriting();
      return;
    }
    if (!article) return;
    openFeedPostReader();
  };
  const articleCoverActivatable = Boolean(article && articleCover);

  const name = displayName(post.accountId, authorProfile?.displayName);
  const badges = postBadges(post, Boolean(poll), mediaItems.length > 0);
  const relationContext = showRelationBadge
    ? postRelationContext(post, {
        viewerAccountId,
        authorName: name,
      })
    : null;
  const relationTargetProfileName =
    relationContext && relationContext.kind !== 'repost'
      ? (authorProfiles?.[relationContext.handle]?.displayName ?? null)
      : null;
  const profileHref = portfolioPath(post.accountId);
  const shareHref = openHref ?? actionHref ?? postThreadPath(post);
  const guildId = post.groupId?.trim() || null;
  const guildLabel =
    showGuildAttribution && guildId ? guildName?.trim() || guildId : null;
  const guildHref = guildId ? guildPath(guildId) : null;
  const detailTimestampIso = detailLayout
    ? postTimestampIso(post.blockTimestamp)
    : undefined;
  const repostedByLabel = repostedBy
    ? viewerAccountId && accountIdsEqual(viewerAccountId, repostedBy.accountId)
      ? 'You reposted'
      : `${displayName(repostedBy.accountId, repostedBy.displayName ?? undefined)} reposted`
    : null;
  const cardClassName = [
    'post-card',
    // No rise-in here: feed skeletons morph in-place; translating up reads as content jump.
    openHref ? 'post-card--openable' : '',
    detailLayout ? 'post-card--detail' : '',
    repostedBy ? 'post-card--reposted' : '',
    article ? 'post-card--article' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClassName} ref={scarceEmbedMergedRef}>
      {openHref ? (
        <Link
          href={openHref}
          className="post-card-hit"
          scroll={false}
          onClick={(event) => interceptOpenHref(event, openHref)}
          onNavigate={(event) => interceptOpenNavigate(event, openHref)}
          aria-label={
            articleHref && !detailLayout && !preferActionHref
              ? 'Read article'
              : 'Open post'
          }
        />
      ) : null}
      {repostedBy && repostedByLabel ? (
        <Link
          href={portfolioPath(repostedBy.accountId)}
          className="post-card-repost-line"
          scroll={false}
          onClick={(event) => event.stopPropagation()}
        >
          <RepeatIcon className="post-card-repost-line-icon" aria-hidden />
          {repostedByLabel}
        </Link>
      ) : null}
      <div className="post-card-copy">
        <header className="post-card-header">
          <div className="post-card-header-stack">
            {guildLabel && guildHref ? (
              <Link
                href={guildHref}
                className="post-card-guild"
                scroll={false}
                onClick={(event) => event.stopPropagation()}
              >
                <UsersFillIcon className="post-card-guild-icon" aria-hidden />
                <span className="post-card-guild-name">{guildLabel}</span>
              </Link>
            ) : null}
            <PostIdentityMeta
              name={name}
              accountId={post.accountId}
              avatar={
                <span className="post-card-avatar-link">
                  <AccountAvatar
                    accountId={post.accountId}
                    kind={authorProfile?.kind}
                    src={authorProfile?.avatarUrl ?? null}
                    fallbackInitial={name}
                    size="lg"
                    className="post-card-avatar"
                  />
                </span>
              }
              timestamp={detailLayout ? undefined : post.blockTimestamp}
              timeHref={detailLayout ? undefined : (openHref ?? undefined)}
              onTimeClick={
                openHref
                  ? (event) => interceptOpenHref(event, openHref)
                  : undefined
              }
              onTimeNavigate={
                openHref
                  ? (event) => interceptOpenNavigate(event, openHref)
                  : undefined
              }
              authorHref={profileHref}
              layout={detailLayout ? 'stacked' : 'inline'}
              channel={
                showChannel
                  ? channelLabel?.trim() || post.channel || undefined
                  : undefined
              }
              trailing={
                <div className="post-identity-trailing">
                  {detailLayout && !isSelf ? (
                    <PostPeekStandButton
                      accountId={post.accountId}
                      name={name}
                      authorProfile={authorProfile}
                    />
                  ) : null}
                  <PostCardMenu
                    href={shareHref}
                    accountId={post.accountId}
                    authorProfile={authorProfile}
                    canCancelScarce={canCancelScarce}
                    onCancelScarce={() => {
                      void handleCancelScarce();
                    }}
                    cancelScarcePending={cancelScarcePending}
                    onMenuOpen={() => {
                      if (isSelf) setMenuForceEmbed(true);
                    }}
                    {...(menuZIndex != null ? { zIndex: menuZIndex } : {})}
                  />
                </div>
              }
            />
          </div>
        </header>
        <PostSensitiveGate labels={labels} safeMode={safeMode}>
          <PostCardBody
            relationContext={relationContext}
            relationTargetProfileName={relationTargetProfileName}
            badges={badges}
            text={text}
            hasMedia={hasMedia}
            expandDisabled={mediaFocused}
            hideText={
              (Boolean(poll) && text === poll?.question) ||
              (mediaItems.length > 0 && !text.trim() && !article) ||
              (isRepostRefType(post.refType) && !text.trim() && !article)
            }
            articleTitle={article?.title ?? null}
            articleHref={readHref}
            onArticleHrefClick={
              readHref
                ? (event) => interceptOpenHref(event, readHref)
                : undefined
            }
            onArticleHrefNavigate={
              readHref
                ? (event) => interceptOpenNavigate(event, readHref)
                : undefined
            }
            onReadArticle={
              article && articleUsesDocumentReader && !preferActionHref
                ? () => openFeedPostReader()
                : null
            }
          />
          {poll ? (
            <PostPollEmbedCard
              poll={poll}
              tally={pollTally}
              pending={pollVotePending}
              onVote={
                onPollVote
                  ? (optionIndex) => onPollVote(post, optionIndex)
                  : undefined
              }
            />
          ) : null}
          {hideMedia ? null : article && articleCover ? (
            <div
              className={[
                'scarce-post-preview',
                'scarce-post-preview--feed',
                articleCover.coverUrl
                  ? 'scarce-post-preview--cover'
                  : 'scarce-post-preview--card',
                'post-card-article-cover',
                articleCover.coverUrl ? 'is-photo' : 'is-card',
              ].join(' ')}
              role={articleCoverActivatable ? 'button' : undefined}
              tabIndex={articleCoverActivatable ? 0 : undefined}
              aria-label={
                articleCoverActivatable
                  ? articleUsesDocumentReader
                    ? 'Read article'
                    : articleHasScarceFace
                      ? 'Open Drop preview'
                      : 'Read article'
                  : undefined
              }
              onClick={(event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                if (articleCoverActivatable) activateArticleCover();
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (!articleCoverActivatable) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                activateArticleCover();
              }}
              onPointerDown={(event: PointerEvent) => {
                event.stopPropagation();
              }}
            >
              <div className="portfolio-writing-cover post-card-article-cover-face">
                <PortfolioWritingCover
                  variant="list"
                  title={article.title}
                  coverUrl={articleCover.coverUrl}
                  cardBg={articleCover.cardBg}
                  format={articleCover.format}
                  markShape={articleCover.markShape}
                  markColor={articleCover.markColor}
                  accountId={post.accountId}
                  displayName={authorProfile?.displayName}
                  avatarUrl={authorProfile?.avatarUrl}
                  postId={post.postId}
                  issuedAt={articleIssuedAt}
                />
              </div>
            </div>
          ) : mediaItems.length > 0 ? (
            <PostMediaStrip
              items={mediaItems}
              size={mediaFocused ? 'page' : 'compact'}
              focused={mediaFocused && mediaItems.length <= 1}
              focusedVideoMuted={!mediaUnmuted}
              resumeFocusedVideo={mediaUnmuted}
              resumeMediaIndex={mediaResumeIndex}
              onActivate={
                hasMedia
                  ? (index) => {
                      const action = resolveFeedMediaActivate(
                        mediaItems,
                        index
                      );
                      if (action.kind === 'enlarge') {
                        setEnlargeOverride(null);
                        setPhotoIndex(action.mediaIndex);
                        setPhotoOpen(true);
                      }
                    }
                  : undefined
              }
            />
          ) : showScarceArt && scarceEmbed ? (
            <ScarcePostPreview
              post={post}
              variant="feed"
              mediaUrl={scarceCoverUrl}
              disableLiveSvg
              cardBg={scarceEmbed.cardBg}
              creatorDisplayName={authorProfile?.displayName}
              onActivate={({ coverSvg }) => {
                const mode = resolveScarceFeedMediumMode(
                  scarceEmbed.mediumKind ?? dropPaint?.mediumKind
                );
                if (mode === 'writing') {
                  openDropWriting(coverSvg);
                  return;
                }
                openFeedMedium(mode, coverSvg);
              }}
            />
          ) : null}
          {!isRepostShell && (scarceEmbed || canListScarce) ? (
            <PostScarceCta
              embed={
                scarceEmbed ?? {
                  status: 'none',
                  events: [],
                }
              }
              isAuthor={isSelf}
              authorAccountId={scarceEmbed?.creatorId?.trim() || post.accountId}
              canList={canListScarce}
              onList={() => setListScarceOpen(true)}
              canSell={canSellScarce}
              onSell={() => setSellScarceOpen(true)}
              canTransfer={canTransferScarce}
              onTransfer={() => setTransferScarceOpen(true)}
              sellListed={sellListedScarce}
              alreadyOwnsEdition={Boolean(ownedScarceItem)}
              onBuy={() => setBuyScarceOpen(true)}
              onBid={() => setBidScarceOpen(true)}
              listenSlot={
                showDropListen || showDropRead ? (
                  <>
                    {showDropRead ? (
                      <button
                        type="button"
                        className="post-card-scarce-listen"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openDropWriting();
                        }}
                      >
                        Read
                      </button>
                    ) : null}
                    {showDropListen ? (
                      <button
                        type="button"
                        className="post-card-scarce-listen"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openFeedMedium('audio');
                        }}
                      >
                        Listen
                      </button>
                    ) : null}
                  </>
                ) : null
              }
            />
          ) : null}
        </PostSensitiveGate>
        {quotedPost ? (
          <QuotedPostInset
            post={quotedPost}
            authorProfile={quotedAuthorProfile}
            href={quotedHref}
            expanded={detailLayout}
            sheetContext={sheetContext}
          />
        ) : null}
        {detailLayout ? (
          <time
            className="post-card-detail-time"
            title={formatPostTimestamp(post.blockTimestamp)}
            {...(detailTimestampIso ? { dateTime: detailTimestampIso } : {})}
          >
            {formatPostTimestamp(post.blockTimestamp)}
          </time>
        ) : null}
        {engagement ? (
          <PostEngagementRow
            engagement={engagement}
            shareHref={shareHref}
            shareTitle={name}
            reactionPending={reactionPending}
            savePending={savePending}
            sharePending={sharePending}
            onReply={onReply}
            onQuote={onQuote}
            onRepost={onRepost}
            onUndoRepost={onUndoRepost}
            onToggleReaction={onToggleReaction}
            onToggleSave={onToggleSave}
            onAmplify={() => setAmplifyOpen(true)}
            post={post}
            {...(menuZIndex != null ? { shareDrawerZIndex: menuZIndex } : {})}
          />
        ) : null}
      </div>
      <PostAmplifySheet
        open={amplifyOpen}
        post={amplifyOpen ? post : null}
        authorName={authorProfile?.displayName}
        workTitle={
          collectionDropTitle?.trim() ||
          tokenDropTitle?.trim() ||
          dropPaint?.title?.trim() ||
          null
        }
        onOpenChange={setAmplifyOpen}
        onAmplified={(amplified, detail) =>
          onAmplifyConfirmed?.(amplified, detail)
        }
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceListSheet
        open={listScarceOpen}
        post={listScarceOpen ? post : null}
        authorName={authorProfile?.displayName}
        onOpenChange={setListScarceOpen}
        onListed={() => retryScarceEmbed()}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceBuySheet
        open={buyScarceOpen}
        post={buyScarceOpen ? post : null}
        authorName={authorProfile?.displayName}
        embed={scarceEmbed}
        alreadyOwnsEdition={Boolean(ownedScarceItem)}
        onOpenChange={setBuyScarceOpen}
        onPurchased={() => {
          retryScarceEmbed();
          refreshOwnedScarce();
        }}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceBidSheet
        open={bidScarceOpen}
        post={bidScarceOpen ? post : null}
        authorName={authorProfile?.displayName}
        embed={scarceEmbed}
        onOpenChange={setBidScarceOpen}
        onBid={() => retryScarceEmbed()}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceTransferSheet
        open={transferScarceOpen && ownedScarceItem != null}
        item={ownedScarceItem}
        ownerAccountId={viewerAccountId}
        onOpenChange={setTransferScarceOpen}
        onTransferred={() => {
          setTransferScarceOpen(false);
          retryScarceEmbed();
          refreshOwnedScarce();
        }}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceSellSheet
        open={sellScarceOpen && ownedScarceItem != null}
        item={ownedScarceItem}
        sellerAccountId={viewerAccountId}
        onOpenChange={setSellScarceOpen}
        onListed={() => {
          setSellScarceOpen(false);
          retryScarceEmbed();
          refreshOwnedScarce();
        }}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <FeedPhotoEnlargeScreen
        open={photoOpen}
        onOpenChange={(open) => {
          setPhotoOpen(open);
          if (!open) {
            setEnlargeOverride(null);
            setPhotoThreadOpen(false);
          }
        }}
        title={enlargeTitle}
        trailing={({ downloadCurrent }) => (
          <PostCardMenu
            href={shareHref}
            openPostHref={postThreadPath(post)}
            onOpenPost={() => {
              setPhotoOpen(false);
              setPhotoThreadOpen(false);
            }}
            onDownload={
              enlargePhotos.length > 0 ? () => downloadCurrent() : undefined
            }
            accountId={post.accountId}
            authorProfile={authorProfile}
            canCancelScarce={canCancelScarce}
            onCancelScarce={() => {
              void handleCancelScarce();
            }}
            cancelScarcePending={cancelScarcePending}
            zIndex={SCARCE_Z.commerceOverListen}
          />
        )}
        peekIdentity={
          <div className="feed-photo-caption-identity-row">
            <Link
              href={profileHref}
              className="os-media-face-identity"
              scroll={false}
              aria-label={`View ${name}'s profile`}
              onClick={() => {
                setPhotoOpen(false);
                setPhotoThreadOpen(false);
              }}
            >
              <AccountAvatar
                accountId={post.accountId}
                kind={authorProfile?.kind}
                src={authorProfile?.avatarUrl ?? null}
                fallbackInitial={name}
                size="lg"
                className="post-card-avatar"
              />
              <span className="os-media-face-identity-copy">
                <span className="os-media-face-identity-name-row">
                  <span className="os-media-face-identity-name">{name}</span>
                  <span className="post-identity-name-marks">
                    <ProtocolNameTrailing accountId={post.accountId} />
                  </span>
                </span>
                <span className="os-media-face-identity-handle">
                  @{post.accountId}
                </span>
              </span>
            </Link>
            {photoOpen && !isSelf ? (
              <PostPeekStandButton
                accountId={post.accountId}
                name={name}
                authorProfile={authorProfile}
              />
            ) : null}
          </div>
        }
        caption={photoCaption}
        captionDate={
          post.blockTimestamp ? formatPostTimestamp(post.blockTimestamp) : null
        }
        photos={enlargePhotos}
        initialIndex={photoIndex}
        threadOpen={photoThreadOpen}
        onDismissThread={dismissPhotoThread}
        threadAuthor={post.accountId}
        threadPostId={post.postId}
        threadRoot={post}
        engagement={
          engagement ? (
            <PostEngagementRow
              engagement={engagement}
              shareHref={shareHref}
              shareTitle={name}
              reactionPending={reactionPending}
              savePending={savePending}
              sharePending={sharePending}
              onReply={openPhotoThread}
              onQuote={
                onQuote
                  ? (target) => {
                      setPhotoOpen(false);
                      onQuote(target);
                    }
                  : undefined
              }
              onRepost={
                onRepost
                  ? (target) => {
                      setPhotoOpen(false);
                      onRepost(target);
                    }
                  : undefined
              }
              onUndoRepost={
                onUndoRepost
                  ? (target) => {
                      setPhotoOpen(false);
                      onUndoRepost(target);
                    }
                  : undefined
              }
              onToggleReaction={onToggleReaction}
              onToggleSave={onToggleSave}
              onAmplify={() => {
                setAmplifyOpen(true);
              }}
              shareDrawerZIndex={SCARCE_Z.commerceOverListen}
              post={post}
            />
          ) : null
        }
      />
      <FeedArticleReadScreen
        open={articleOpen}
        onOpenChange={(next) => {
          setArticleOpen(next);
          if (!next) {
            setFeedReadEssay(null);
            setFeedBookRead(false);
            setFeedBookCoverSvg(null);
            setPhotoThreadOpen(false);
          }
        }}
        post={feedReadEssay ?? post}
        authorProfile={
          feedReadEssay
            ? feedReadAuthors[feedReadEssay.accountId]
            : authorProfile
        }
        documentTitle={feedBookRead ? dropListenTitle : undefined}
        threadOpen={photoThreadOpen}
        onDismissThread={dismissPhotoThread}
        threadAuthor={post.accountId}
        threadPostId={post.postId}
        threadRoot={post}
        renderBody={
          feedBookRead
            ? ({ onChromeTap }) => (
                <WritingReadDocument
                  open={articleOpen}
                  title={dropListenTitle}
                  cover={scarceCoverUrl}
                  coverSvg={feedBookCoverSvg}
                  collectionId={scarceEmbed?.collectionId?.trim() || ''}
                  accountId={viewerAccountId}
                  creatorId={scarceEmbed?.creatorId ?? post.accountId}
                  readables={collectionReadables}
                  bookPdf={collectionBookPdf}
                  writingFormat={collectionWritingFormat}
                  canRead
                  lockedHint=""
                  onChromeTap={onChromeTap}
                />
              )
            : undefined
        }
        commerce={
          !isRepostShell && (scarceEmbed || canListScarce) ? (
            <PostScarceCta
              embed={
                scarceEmbed ?? {
                  status: 'none',
                  events: [],
                }
              }
              isAuthor={isSelf}
              authorAccountId={scarceEmbed?.creatorId?.trim() || post.accountId}
              canList={canListScarce}
              onList={() => setListScarceOpen(true)}
              canSell={canSellScarce}
              onSell={() => setSellScarceOpen(true)}
              canTransfer={canTransferScarce}
              onTransfer={() => setTransferScarceOpen(true)}
              sellListed={sellListedScarce}
              alreadyOwnsEdition={Boolean(ownedScarceItem)}
              onBuy={() => setBuyScarceOpen(true)}
              onBid={() => setBidScarceOpen(true)}
            />
          ) : null
        }
        engagement={
          engagement ? (
            <PostEngagementRow
              engagement={engagement}
              shareHref={shareHref}
              shareTitle={name}
              reactionPending={reactionPending}
              savePending={savePending}
              sharePending={sharePending}
              onReply={openPhotoThread}
              onQuote={
                onQuote
                  ? (target) => {
                      setArticleOpen(false);
                      onQuote(target);
                    }
                  : undefined
              }
              onRepost={
                onRepost
                  ? (target) => {
                      setArticleOpen(false);
                      onRepost(target);
                    }
                  : undefined
              }
              onUndoRepost={
                onUndoRepost
                  ? (target) => {
                      setArticleOpen(false);
                      onUndoRepost(target);
                    }
                  : undefined
              }
              onToggleReaction={onToggleReaction}
              onToggleSave={onToggleSave}
              onAmplify={() => {
                setAmplifyOpen(true);
              }}
              shareDrawerZIndex={SCARCE_Z.commerceOverListen}
              post={post}
            />
          ) : null
        }
      />
      <ScarceFeedMediumSheet
        open={feedMediumOpen}
        onOpenChange={(next) => {
          setFeedMediumOpen(next);
          if (!next) setPhotoThreadOpen(false);
        }}
        mode={feedMediumMode}
        threadOpen={photoThreadOpen}
        onDismissThread={dismissPhotoThread}
        threadAuthor={post.accountId}
        threadPostId={post.postId}
        threadRoot={post}
        trailing={
          <PostCardMenu
            href={shareHref}
            openPostHref={postThreadPath(post)}
            onOpenPost={() => {
              setFeedMediumOpen(false);
              setPhotoThreadOpen(false);
            }}
            onDownload={
              scarceCoverUrl || feedMediumCoverSvg
                ? async () => {
                    if (scarceCoverUrl) {
                      await downloadIpfsMedia({
                        url: scarceCoverUrl,
                        mime: 'image/jpeg',
                        title: dropListenTitle,
                        fallbackName: 'drop',
                        exportFile: true,
                      });
                      return;
                    }
                    const svg = feedMediumCoverSvg?.trim();
                    if (!svg) {
                      throw new Error('Could not download this file.');
                    }
                    const blob = new Blob([svg], { type: 'image/svg+xml' });
                    const objectUrl = URL.createObjectURL(blob);
                    try {
                      await downloadIpfsMedia({
                        url: objectUrl,
                        mime: 'image/svg+xml',
                        title: dropListenTitle,
                        fallbackName: 'drop',
                        exportFile: true,
                      });
                    } finally {
                      URL.revokeObjectURL(objectUrl);
                    }
                  }
                : undefined
            }
            accountId={post.accountId}
            authorProfile={authorProfile}
            canCancelScarce={canCancelScarce}
            onCancelScarce={() => {
              void handleCancelScarce();
            }}
            cancelScarcePending={cancelScarcePending}
            zIndex={SCARCE_Z.commerceOverListen}
          />
        }
        title={dropListenTitle}
        cover={scarceCoverUrl}
        coverSvg={feedMediumCoverSvg}
        creatorId={scarceEmbed?.creatorId ?? post.accountId}
        collectionId={scarceEmbed?.collectionId ?? null}
        tokenId={scarceEmbed?.tokenId ?? null}
        playables={listenPlayables}
        readables={collectionReadables}
        writingFormat={collectionWritingFormat}
        bookPdf={collectionBookPdf}
        viewerAccountId={viewerAccountId}
        commerce={
          !isRepostShell && (scarceEmbed || canListScarce) ? (
            <PostScarceCta
              embed={
                scarceEmbed ?? {
                  status: 'none',
                  events: [],
                }
              }
              isAuthor={isSelf}
              authorAccountId={scarceEmbed?.creatorId?.trim() || post.accountId}
              canList={canListScarce}
              onList={() => {
                setListScarceOpen(true);
              }}
              canSell={canSellScarce}
              onSell={() => {
                setSellScarceOpen(true);
              }}
              canTransfer={canTransferScarce}
              onTransfer={() => setTransferScarceOpen(true)}
              sellListed={sellListedScarce}
              alreadyOwnsEdition={Boolean(ownedScarceItem)}
              onBuy={() => {
                setBuyScarceOpen(true);
              }}
              onBid={() => {
                setBidScarceOpen(true);
              }}
            />
          ) : null
        }
        engagement={
          engagement ? (
            <PostEngagementRow
              engagement={engagement}
              shareHref={shareHref}
              shareTitle={name}
              reactionPending={reactionPending}
              savePending={savePending}
              sharePending={sharePending}
              onReply={openPhotoThread}
              onQuote={
                onQuote
                  ? (target) => {
                      setFeedMediumOpen(false);
                      onQuote(target);
                    }
                  : undefined
              }
              onRepost={
                onRepost
                  ? (target) => {
                      setFeedMediumOpen(false);
                      onRepost(target);
                    }
                  : undefined
              }
              onUndoRepost={
                onUndoRepost
                  ? (target) => {
                      setFeedMediumOpen(false);
                      onUndoRepost(target);
                    }
                  : undefined
              }
              onToggleReaction={onToggleReaction}
              onToggleSave={onToggleSave}
              onAmplify={() => {
                setFeedMediumOpen(false);
                setAmplifyOpen(true);
              }}
              shareDrawerZIndex={SCARCE_Z.commerceOverListen}
              post={post}
            />
          ) : null
        }
      />
    </article>
  );
}

function repostedByEqual(
  a: PostCardProps['repostedBy'],
  b: PostCardProps['repostedBy']
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.accountId === b.accountId &&
    (a.displayName ?? null) === (b.displayName ?? null)
  );
}

/*
 * Feed rows re-render whenever any shared feed-level state moves (an
 * engagement toggle, a profile fetch landing, the new-posts probe). Card
 * props are per-post slices with stable identities, so a shallow compare
 * lets untouched cards skip this render entirely. `repostedBy` is rebuilt
 * per render for repost rows — compare it by value.
 */
function postCardPropsEqual(prev: PostCardProps, next: PostCardProps): boolean {
  const keys = new Set<keyof PostCardProps>([
    ...(Object.keys(prev) as Array<keyof PostCardProps>),
    ...(Object.keys(next) as Array<keyof PostCardProps>),
  ]);
  for (const key of keys) {
    if (key === 'repostedBy') {
      if (!repostedByEqual(prev.repostedBy, next.repostedBy)) return false;
      continue;
    }
    if (!Object.is(prev[key], next[key])) return false;
  }
  return true;
}

export const PostCard = memo(PostCardImpl, postCardPropsEqual);

export { postKey };
export { QuotedPostInset };
