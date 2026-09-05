'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  BookmarkFillIcon,
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  Divider,
  DotsVerticalIcon,
  FireBFillIcon,
  FireBIcon,
  GiftIcon,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  ProtocolMotionArrow,
  MultiplyIcon,
  PulsingDots,
  RepeatIcon,
  ShareIcon,
  TrashIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersFillIcon,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
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
import { PostAmplifySheet } from '@/features/home/post-amplify-sheet';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  useFocusWriteDock,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { useReplyWriteDock } from '@/hooks/use-reply-write-dock';
import { writeDockDraftKey } from '@/lib/os-write-dock';
import { guildPath } from '@/features/guilds/guilds-data';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
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
import { portfolioPath, writingArticlePath } from '@/lib/overlay-routes';
import {
  articleTeaseSource,
  parseArticleSnapshot,
} from '@/lib/article-post-payload';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  formatPostTimestamp,
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
  parsePostPollEmbed,
  parsePostText,
  parsePostTokenEmbed,
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
  isRenderablePostVideoMime,
  appendPostMediaIndex,
  appendPostMediaUnmute,
  formatMediaDuration,
  postStillImages,
  resolveFeedMediaActivate,
  truncateQuoteText,
  type PostMediaItem,
} from '@/lib/post-media';
import { postThreadPath } from '@/lib/post-routes';
import { shareUrl } from '@/lib/share-url';
import type { PollTally } from '@/lib/poll-votes';
import { fallbackLabel } from '@/lib/profile-display';
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
  /** Detail opened with `?media=unmute` — resume video with sound. */
  mediaUnmuted?: boolean;
  /** Collage tile index to unmute (`?mi=`). */
  mediaResumeIndex?: number;
  /**
   * Open post / thread root: stacked name + @handle, full timestamp under
   * the body above engagement icons.
   */
  detailLayout?: boolean;
}

function PostCardMenu({
  href,
  accountId,
  authorProfile,
  canCancelScarce = false,
  onCancelScarce,
  cancelScarcePending = false,
  onMenuOpen,
}: {
  href?: string;
  accountId: string;
  authorProfile?: PostAuthorProfile;
  canCancelScarce?: boolean;
  onCancelScarce?: () => void;
  cancelScarcePending?: boolean;
  onMenuOpen?: () => void;
}) {
  const router = useRouter();
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
        leading: (
          <span className="signal-group signal-group-endorse" aria-hidden>
            <ProtocolMotionArrow className="os-action-drawer-icon" />
          </span>
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
        leading: (
          <UserMinusIcon className="os-action-drawer-icon" aria-hidden />
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
        leading: <MultiplyIcon className="os-action-drawer-icon" aria-hidden />,
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
          aria-label="Post options"
        >
          <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
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
              : 'Post options'
          }
          copy={confirmBlock ? authorLabel : undefined}
          listAriaLabel="Post options"
          closeAriaLabel={
            confirmBlock ? 'Back to post options' : 'Close post options'
          }
          items={confirmBlock ? undefined : menuItems}
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
      />
      <ProfileSupportSheet
        open={supportOpen}
        pageAccountId={accountId}
        profileName={authorProfile?.displayName}
        avatarUrl={authorProfile?.avatarUrl}
        onOpenChange={setSupportOpen}
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

export function QuotedPostInset({
  post,
  authorProfile,
  href,
}: {
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  /** Navigate to the quoted post's own page (feed/thread surfaces). */
  href?: string;
}) {
  const router = useRouter();
  const { safeMode } = useViewerSafeMode();
  const labels = parsePostContentLabels(post.value);
  const name =
    authorProfile?.displayName?.trim() || fallbackLabel(post.accountId);
  const text = truncateQuoteText(parsePostText(post.value));
  const mediaItems = parsePostMedia(post.value).slice(0, 4);
  const thumb = mediaItems.length === 1 ? mediaItems[0] : null;
  const collage = mediaItems.length > 1 ? mediaItems : null;
  const interactive = Boolean(href);

  const open = (event: {
    preventDefault(): void;
    stopPropagation(): void;
    target?: EventTarget | null;
  }) => {
    if (!href) return;
    // Let nested # / @ / $ / external links win over the inset navigate.
    if (
      event.target instanceof Element &&
      event.target.closest('a[href], button')
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    router.push(href);
  };

  return (
    <div
      className={`post-card-quote-inset${interactive ? ' post-card-quote-inset--link' : ''}`}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `View quoted post by ${name}` : undefined}
      onClick={interactive ? open : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') open(event);
            }
          : undefined
      }
    >
      <Divider orientation="vertical" variant="detail" />
      <div className="post-card-quote-inset-content">
        <span className="post-card-quote-inset-head">
          <AccountAvatar
            accountId={post.accountId}
            kind={authorProfile?.kind}
            src={authorProfile?.avatarUrl ?? null}
            fallbackInitial={name}
            size="sm"
            className="post-card-quote-inset-avatar"
          />
          <PostIdentityMeta
            name={name}
            accountId={post.accountId}
            timestamp={post.blockTimestamp}
          />
        </span>
        <PostSensitiveGate labels={labels} safeMode={safeMode} compact>
          {thumb || collage || text ? (
            <div
              className={[
                'post-card-quote-inset-body-row',
                thumb ? 'has-media' : '',
                collage ? 'is-stacked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* Multi: text above mini-collage. Single: thumb beside text. */}
              {collage && text ? (
                <p className="post-card-quote-inset-body">
                  <PostRichText text={text} />
                </p>
              ) : null}
              {collage ? (
                <PostMediaStrip items={collage} size="quote" playbackDisabled />
              ) : null}
              {thumb ? <QuoteMediaThumb item={thumb} /> : null}
              {!collage && text ? (
                <p className="post-card-quote-inset-body">
                  <PostRichText text={text} />
                </p>
              ) : null}
            </div>
          ) : (
            <p className="post-card-quote-inset-body">…</p>
          )}
        </PostSensitiveGate>
      </div>
    </div>
  );
}

function QuoteMediaThumb({ item }: { item: PostMediaItem }) {
  const isVideo = isRenderablePostVideoMime(item.mime);
  const [durationByUrl, setDurationByUrl] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const durationLabel =
    isVideo && durationByUrl?.url === item.url ? durationByUrl.label : '';

  useEffect(() => {
    if (!isVideo) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (cancelled) return;
      setDurationByUrl({
        url: item.url,
        label: formatMediaDuration(video.duration),
      });
    };
    video.onerror = () => {
      if (!cancelled) setDurationByUrl({ url: item.url, label: '' });
    };
    video.src = item.url;
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [isVideo, item.url]);

  return (
    <div className="post-card-quote-thumb" aria-hidden>
      {isVideo ? (
        <video
          src={item.url}
          muted
          playsInline
          preload="metadata"
          className="post-card-quote-thumb-media"
        />
      ) : (
        <img
          src={item.url}
          alt=""
          className="post-card-quote-thumb-media"
          loading="lazy"
          decoding="async"
        />
      )}
      {durationLabel ? (
        <span className="post-card-quote-thumb-duration">{durationLabel}</span>
      ) : null}
    </div>
  );
}

function ReactIcon({ filled }: { filled: boolean }) {
  return filled ? <HeartFillIcon aria-hidden /> : <HeartIcon aria-hidden />;
}

function AmplifyIcon({ filled }: { filled: boolean }) {
  return filled ? <FireBFillIcon aria-hidden /> : <FireBIcon aria-hidden />;
}

function BookmarkGlyph({ filled }: { filled: boolean }) {
  return filled ? (
    <BookmarkFillIcon aria-hidden />
  ) : (
    <BookmarkIcon aria-hidden />
  );
}

function absolutePostUrl(href: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return null;
  }
}

function PostShareControl({
  href,
  title,
}: {
  href: string;
  title?: string | null;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [copied, setCopied] = useState(false);
  const label = title?.trim() || 'post';

  return (
    <button
      type="button"
      className={`post-card-stat post-card-stat-button post-card-share${
        copied ? ' is-copied' : ''
      }`}
      aria-label={copied ? 'Link copied' : 'Share this post'}
      title={copied ? 'Link copied' : 'Share'}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const url = absolutePostUrl(href);
        if (!url) return;
        void (async () => {
          const result = await shareUrl({
            url,
            title: label,
            text: `Check out this post on OnSocial`,
          });
          if (result === 'copied') {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
            return;
          }
          if (result === 'failed') {
            setTxResult({
              type: 'error',
              msg: 'Couldn’t share this post.',
            });
          }
        })();
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <ShareIcon aria-hidden />}
    </button>
  );
}

function engagementStatClassName(
  tone: 'reply' | 'quote' | 'amplify' | undefined,
  interactive: boolean,
  className?: string
) {
  const toneClass =
    tone === 'reply'
      ? ' post-card-stat--reply'
      : tone === 'quote'
        ? ' post-card-stat--quote'
        : tone === 'amplify'
          ? ' post-card-stat--amplify'
          : '';
  const base = interactive
    ? `post-card-stat post-card-stat-button${toneClass}`
    : `post-card-stat${toneClass}`;
  return className ? `${base} ${className}` : base;
}

function EngagementStat({
  icon,
  count,
  label,
  actionLabel,
  onActivate,
  className,
  disabled,
  ariaPressed,
  tone,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  actionLabel?: string;
  onActivate?: () => void;
  className?: string;
  disabled?: boolean;
  ariaPressed?: boolean;
  tone?: 'reply' | 'quote' | 'amplify';
}) {
  const countNode =
    count > 0 ? (
      <span className="post-card-engagement-count">{count}</span>
    ) : null;

  if (onActivate) {
    return (
      <button
        type="button"
        className={engagementStatClassName(tone, true, className)}
        disabled={disabled}
        aria-pressed={ariaPressed}
        aria-label={actionLabel ?? label}
        title={actionLabel ?? label}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }}
      >
        {icon}
        {countNode}
      </button>
    );
  }

  return (
    <span
      className={engagementStatClassName(tone, false, className)}
      aria-label={`${count} ${label}`}
      title={label}
    >
      {icon}
      {countNode}
    </span>
  );
}

function PostEngagementRow({
  engagement,
  shareHref,
  shareTitle,
  reactionPending,
  savePending,
  sharePending,
  onReply,
  onQuote,
  onRepost,
  onUndoRepost,
  onToggleReaction,
  onToggleSave,
  onAmplify,
  shareDrawerZIndex,
  post,
}: {
  engagement: PostEngagement;
  shareHref: string;
  shareTitle?: string | null;
  reactionPending?: boolean;
  savePending?: boolean;
  sharePending?: boolean;
  onReply?: (post: PostRow) => void;
  onQuote?: (post: PostRow) => void;
  onRepost?: (post: PostRow) => void;
  onUndoRepost?: (post: PostRow) => void;
  onToggleReaction?: (post: PostRow) => void;
  onToggleSave?: (post: PostRow) => void;
  onAmplify: () => void;
  /** Quote / repost drawer — raise when this row sits on an OS enlarge. */
  shareDrawerZIndex?: number;
  post: PostRow;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const canShare = Boolean(onQuote || onRepost || onUndoRepost);
  const closeShare = () => setShareOpen(false);
  const shareCount =
    (engagement.repostCount ?? 0) + (engagement.quoteCount ?? 0);
  const shareItems = useMemo<ActionDrawerItem[]>(() => {
    const items: ActionDrawerItem[] = [];
    if (
      engagement.viewerReposted &&
      onUndoRepost &&
      engagement.viewerRepostId
    ) {
      items.push({
        id: 'unrepost',
        label: 'Undo repost',
        description: 'Remove from your feed',
        leading: <RepeatIcon className="os-action-drawer-icon" aria-hidden />,
        disabled: sharePending,
        onSelect: () => {
          closeShare();
          onUndoRepost(post);
        },
      });
    } else if (onRepost && !engagement.viewerReposted) {
      items.push({
        id: 'repost',
        label: 'Repost',
        description: post.groupId
          ? 'Share in this guild'
          : 'Share to your feed',
        leading: <RepeatIcon className="os-action-drawer-icon" aria-hidden />,
        disabled: sharePending,
        onSelect: () => {
          closeShare();
          onRepost(post);
        },
      });
    }
    if (onQuote) {
      items.push({
        id: 'quote',
        label: 'Quote',
        description: 'Add a comment',
        leading: (
          <MessageRoundIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          closeShare();
          onQuote(post);
        },
      });
    }
    return items;
  }, [
    engagement.viewerReposted,
    engagement.viewerRepostId,
    onQuote,
    onRepost,
    onUndoRepost,
    post,
    sharePending,
  ]);

  return (
    <div className="post-card-engagement">
      <div className="post-card-engagement-actions">
        <EngagementStat
          icon={<MessageRoundIcon aria-hidden />}
          count={engagement.replyCount}
          label="replies"
          tone="reply"
          actionLabel={onReply ? 'Reply to this post' : undefined}
          onActivate={onReply ? () => onReply(post) : undefined}
        />
        <EngagementStat
          icon={
            sharePending ? (
              <PulsingDots size="sm" label="Confirming share" />
            ) : (
              <RepeatIcon aria-hidden />
            )
          }
          count={shareCount}
          label="shares"
          tone="quote"
          className={
            `${engagement.viewerReposted && !sharePending ? 'is-active' : ''}${sharePending ? ' is-pending' : ''}`.trim() ||
            undefined
          }
          disabled={sharePending}
          ariaPressed={
            sharePending ? undefined : engagement.viewerReposted || undefined
          }
          actionLabel={
            sharePending
              ? 'Confirming share'
              : canShare
                ? engagement.viewerReposted
                  ? 'Undo repost or quote'
                  : 'Quote or repost'
                : undefined
          }
          onActivate={
            canShare && !sharePending ? () => setShareOpen(true) : undefined
          }
        />
        {onToggleReaction ? (
          <EngagementStat
            icon={<ReactIcon filled={engagement.viewerReacted} />}
            count={engagement.reactionCount}
            label="reactions"
            className={`post-card-react${engagement.viewerReacted ? ' is-active' : ''}${reactionPending ? ' is-pending' : ''}`}
            disabled={reactionPending}
            ariaPressed={engagement.viewerReacted}
            actionLabel={
              engagement.viewerReacted
                ? 'Remove your reaction'
                : 'React to this post'
            }
            onActivate={() => onToggleReaction(post)}
          />
        ) : (
          <EngagementStat
            icon={<ReactIcon filled={false} />}
            count={engagement.reactionCount}
            label="reactions"
          />
        )}
        <EngagementStat
          icon={<AmplifyIcon filled={engagement.viewerAmplified} />}
          count={engagement.amplifyCount}
          label="amplifies"
          tone="amplify"
          className={`post-card-amplify${engagement.viewerAmplified ? ' is-active' : ''}`}
          ariaPressed={engagement.viewerAmplified}
          actionLabel={
            engagement.viewerAmplified ? 'Amplify again' : 'Amplify this post'
          }
          onActivate={onAmplify}
        />
      </div>
      <div className="post-card-engagement-trailing">
        {onToggleSave ? (
          <button
            type="button"
            className={`post-card-stat post-card-stat-button post-card-save${
              engagement.viewerSaved ? ' is-active' : ''
            }${savePending ? ' is-pending' : ''}`}
            disabled={savePending}
            aria-pressed={engagement.viewerSaved}
            aria-label={
              engagement.viewerSaved ? 'Remove from saved' : 'Save this post'
            }
            title={engagement.viewerSaved ? 'Saved' : 'Save'}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSave(post);
            }}
          >
            <BookmarkGlyph filled={engagement.viewerSaved} />
          </button>
        ) : null}
        <PostShareControl href={shareHref} title={shareTitle} />
      </div>
      {canShare ? (
        <ActionDrawer
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          label="Quote or repost"
          items={shareItems}
          {...(shareDrawerZIndex != null ? { zIndex: shareDrawerZIndex } : {})}
        />
      ) : null}
    </div>
  );
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
}) {
  const [expanded, setExpanded] = useState(false);
  const previewLimit = postFeedPreviewLimit(hasMedia);
  const isArticle = Boolean(articleTitle && articleHref);
  const canExpand =
    !isArticle &&
    !expandDisabled &&
    !hideText &&
    postPreviewNeedsExpand(text, previewLimit);
  const tease = isArticle
    ? truncatePostPreview(articleTeaseSource(text), previewLimit)
    : canExpand && !expanded
      ? truncatePostPreview(text, previewLimit)
      : text;
  const showArticleRead =
    isArticle &&
    Boolean(articleHref) &&
    (postPreviewNeedsExpand(text, previewLimit) || Boolean(articleTitle));

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
          <p className="post-card-body">
            <PostRichText text={tease} inlineMarks={isArticle} />
          </p>
          {canExpand ? (
            <button
              type="button"
              className="post-card-show-more"
              aria-expanded={expanded}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
          {showArticleRead && articleHref ? (
            <Link
              href={articleHref}
              className="post-card-show-more"
              scroll={false}
              onClick={(event) => event.stopPropagation()}
            >
              Read
            </Link>
          ) : null}
        </div>
      ) : showArticleRead && articleHref ? (
        <div className="post-card-body-block">
          <Link
            href={articleHref}
            className="post-card-show-more"
            scroll={false}
            onClick={(event) => event.stopPropagation()}
          >
            Read
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function PostRowSkeleton({
  rows = 3,
  /** Reserve the room row under identity (guild All feed) so posts don’t jump. */
  showChannel = false,
}: {
  rows?: number;
  showChannel?: boolean;
}) {
  return (
    <div className="post-row-skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index}>
          {index > 0 ? (
            <div className="post-row-skeleton-divider" aria-hidden />
          ) : null}
          <div className="post-card post-card--skeleton">
            <div className="post-card-avatar post-row-skeleton-avatar standing-row-shimmer" />
            <div className="post-card-copy">
              {/* One identity row — matches live Name @handle · time. */}
              <div className="post-row-skeleton-identity">
                <div className="standing-row-shimmer post-row-skeleton-line" />
                <div className="standing-row-shimmer post-row-skeleton-line-sm" />
              </div>
              {showChannel ? (
                <div className="standing-row-shimmer post-row-skeleton-channel" />
              ) : null}
              <div className="standing-row-shimmer post-row-skeleton-line-body" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PostCard({
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
  onExpandReply,
  onQuote,
  onRepost,
  onUndoRepost,
  pollTally,
  pollVotePending,
  onPollVote,
  mediaFocused = false,
  mediaUnmuted = false,
  mediaResumeIndex = 0,
  detailLayout = false,
}: PostCardProps) {
  const router = useRouter();
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const { safeMode } = useViewerSafeMode();
  const [amplifyOpen, setAmplifyOpen] = useState(false);
  const [listScarceOpen, setListScarceOpen] = useState(false);
  const [buyScarceOpen, setBuyScarceOpen] = useState(false);
  const [bidScarceOpen, setBidScarceOpen] = useState(false);
  const [sellScarceOpen, setSellScarceOpen] = useState(false);
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
  const enlargeWrite = photoOpen || feedMediumOpen;
  const focusWriteDock = useFocusWriteDock();
  useReplyWriteDock({
    target: post,
    enabled: enlargeWrite,
    placeholder: 'Add a reply…',
    revision: enlargeWrite ? postKey(post) : '',
    draftKey: writeDockDraftKey('post', postKey(post)),
    onExpand: onExpandReply
      ? (payload) => {
          setPhotoOpen(false);
          setFeedMediumOpen(false);
          onExpandReply(post, payload);
        }
      : undefined,
  });
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
      if (!cancelled) setOwnedScarceByKey({ key: ownershipKey, item });
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
  const articleHref = article
    ? writingArticlePath(post.accountId, post.postId)
    : null;
  const labels = parsePostContentLabels(post.value);
  const poll = parsePostPollEmbed(post.value);
  const dropPaint = parseDropPaintSnapshot(post.value);
  const mediaItems = parsePostMedia(post.value);
  const hasMedia = mediaItems.length > 0;
  const stillPhotos = postStillImages(mediaItems);
  const photoSubtitle = text.trim()
    ? truncatePostPreview(text.split(/\r?\n/, 1)[0] ?? '', 72)
    : null;
  const photoCover = postScarceCoverImage(post);
  const scarceCoverUrl =
    scarceEmbed?.mediaUrl?.trim() || dropPaint?.mediaUrl?.trim() || null;
  const showScarceArt =
    !photoCover &&
    Boolean(scarceEmbed) &&
    (scarceEmbed?.status === 'lazy_listing' ||
      scarceEmbed?.status === 'drop' ||
      scarceEmbed?.status === 'listed' ||
      scarceEmbed?.status === 'sold' ||
      scarceEmbed?.status === 'auction' ||
      scarceEmbed?.status === 'minted');
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
  const fallback = fallbackLabel(post.accountId);
  const name = authorProfile?.displayName?.trim() || fallback;
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
  const shareHref = actionHref ?? postThreadPath(post);
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
    actionHref ? 'post-card--openable' : '',
    detailLayout ? 'post-card--detail' : '',
    repostedBy ? 'post-card--reposted' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClassName} ref={scarceEmbedMergedRef}>
      {actionHref ? (
        <Link
          href={actionHref}
          className="post-card-hit"
          scroll={false}
          aria-label="Open post"
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
      <Link
        href={profileHref}
        className="post-card-avatar-link"
        scroll={false}
        aria-label={`View ${name}'s profile`}
      >
        <AccountAvatar
          accountId={post.accountId}
          kind={authorProfile?.kind}
          src={authorProfile?.avatarUrl ?? null}
          fallbackInitial={name}
          size="lg"
          className="post-card-avatar"
        />
      </Link>
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
              timestamp={detailLayout ? undefined : post.blockTimestamp}
              timeHref={detailLayout ? undefined : actionHref}
              authorHref={profileHref}
              layout={detailLayout ? 'stacked' : 'inline'}
              channel={
                showChannel
                  ? channelLabel?.trim() || post.channel || undefined
                  : undefined
              }
              trailing={
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
                />
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
            articleHref={articleHref}
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
          {mediaItems.length > 0 ? (
            <PostMediaStrip
              items={mediaItems}
              size={mediaFocused ? 'page' : 'compact'}
              focused={mediaFocused}
              focusedVideoMuted={!mediaUnmuted}
              resumeFocusedVideo={mediaUnmuted}
              resumeMediaIndex={mediaResumeIndex}
              onActivate={
                !mediaFocused && hasMedia
                  ? (index) => {
                      const action = resolveFeedMediaActivate(
                        mediaItems,
                        index
                      );
                      if (action.kind === 'enlarge') {
                        setPhotoIndex(action.stillIndex);
                        setPhotoOpen(true);
                        return;
                      }
                      if (action.kind === 'thread' && actionHref) {
                        router.push(
                          action.unmute
                            ? appendPostMediaUnmute(
                                actionHref,
                                action.mediaIndex
                              )
                            : appendPostMediaIndex(
                                actionHref,
                                action.mediaIndex
                              )
                        );
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
              onActivate={({ coverSvg }) =>
                openFeedMedium(
                  resolveScarceFeedMediumMode(
                    scarceEmbed.mediumKind ?? dropPaint?.mediumKind
                  ),
                  coverSvg
                )
              }
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
                          openFeedMedium('writing');
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
          />
        ) : null}
      </div>
      <PostAmplifySheet
        open={amplifyOpen}
        post={amplifyOpen ? post : null}
        authorName={authorProfile?.displayName}
        onOpenChange={setAmplifyOpen}
        onAmplified={(amplified, detail) =>
          onAmplifyConfirmed?.(amplified, detail)
        }
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
      />
      <FeedPhotoEnlargeScreen
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        title={name}
        subtitle={photoSubtitle}
        photos={stillPhotos}
        initialIndex={photoIndex}
        engagement={
          engagement ? (
            <PostEngagementRow
              engagement={engagement}
              shareHref={shareHref}
              shareTitle={name}
              reactionPending={reactionPending}
              savePending={savePending}
              sharePending={sharePending}
              onReply={() => {
                focusWriteDock();
              }}
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
                setPhotoOpen(false);
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
        onOpenChange={setFeedMediumOpen}
        mode={feedMediumMode}
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
              onReply={
                onReply
                  ? () => {
                      focusWriteDock();
                    }
                  : undefined
              }
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

export { postKey };
