'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  CopyIcon,
  Divider,
  DotsVerticalIcon,
  FireBFillIcon,
  FireBIcon,
  GiftIcon,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  ProfileAvatar,
  RepeatIcon,
  TrashIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersFillIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { PostAmplifySheet } from '@/features/home/post-amplify-sheet';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { guildPath } from '@/features/guilds/guilds-data';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { PostMediaStrip } from '@/features/home/post-media';
import { PostPollEmbedCard } from '@/features/home/post-poll-embed';
import { PostRichText } from '@/features/home/post-rich-text';
import {
  canCancelPostScarce,
  cancelPostScarceListing,
} from '@/features/scarces/cancel-post-scarce';
import { PostScarceCta } from '@/features/scarces/post-scarce-cta';
import { invalidateLiveListingsCache } from '@/features/market/market-listings';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarceBidSheet } from '@/features/scarces/scarce-bid-sheet';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { ScarceListSheet } from '@/features/scarces/scarce-list-sheet';
import {
  postScarceAudio,
  postScarceCoverImage,
  ScarcePostPreview,
} from '@/features/scarces/scarce-post-preview';
import { postDropIsPlayable } from '@/features/scarces/post-drop-cta';
import {
  resolveScarceFeedMediumMode,
  ScarceFeedMediumSheet,
  type ScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-sheet';
import { usePostCollectionEmbed } from '@/features/scarces/use-post-collection-embed';
import { usePostScarceEmbed } from '@/features/scarces/use-post-scarce-embed';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { overlayPath, portfolioPath } from '@/lib/overlay-routes';
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
  postFeedPreviewLimit,
  postKey,
  postPreviewNeedsExpand,
  postTimestampIso,
  truncatePostPreview,
} from '@/lib/post-display';
import {
  parsePostMedia,
  isRenderablePostVideoMime,
  appendPostMediaIndex,
  appendPostMediaUnmute,
  formatMediaDuration,
  truncateQuoteText,
  type PostMediaItem,
} from '@/lib/post-media';
import { postThreadPath } from '@/lib/post-routes';
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
  /** Compact inset preview of the post this one quotes. */
  quotedPost?: PostRow;
  quotedAuthorProfile?: PostAuthorProfile;
  /** Click-through to the quoted post's own page. */
  quotedHref?: string;
  /** Hide the `Replying to @x` context line (redundant inside thread tabs). */
  showRelationBadge?: boolean;
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
  onToggleReaction?: (post: PostRow) => void;
  /** Optimistic amplify count / Hot heat after a confirmed spend. */
  onAmplifyConfirmed?: (
    post: PostRow,
    detail: PostAmplifySuccessDetail
  ) => void;
  /** Open a reply composer targeting this post. */
  onReply?: (post: PostRow) => void;
  /** Open a quote composer targeting this post. */
  onQuote?: (post: PostRow) => void;
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
  const { viewerStanding, isLoading } = useViewerRelationship(
    relationshipAccountId
  );
  const { updateStanding, isStandingPendingForTarget } = useViewerStanding(
    relationshipAccountId || accountId
  );
  const [supportOpen, setSupportOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const isOpen = open && !closing;
  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);
  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);
  const close = requestClose;

  const isSelf =
    Boolean(viewerAccountId) && accountIdsEqual(viewerAccountId!, accountId);
  const showGestures = isConnected && !isSelf;
  const showCancelScarce =
    isConnected && isSelf && canCancelScarce && onCancelScarce;
  const pending = isStandingPendingForTarget(accountId);
  const profileHref = portfolioPath(accountId);
  const endorsementsHref = overlayPath(accountId, 'endorsements');

  const copyLink = async () => {
    if (!href || typeof window === 'undefined') return;
    const url = new URL(href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can fail in insecure contexts — still close the menu.
    }
    close();
  };

  async function handleStandToggle() {
    if (pending || isLoading || !gesturesArmed) return;
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

  const standLabel = isLoading
    ? '…'
    : pending
      ? viewerStanding
        ? 'Stepping back…'
        : 'Standing…'
      : viewerStanding
        ? 'Step back'
        : 'Stand with';

  const menuItems = useMemo<ActionDrawerItem[]>(() => {
    const items: ActionDrawerItem[] = [];
    if (showGestures) {
      items.push({
        id: 'stand',
        label: standLabel,
        disabled: pending || isLoading,
        leading: viewerStanding ? (
          <UserMinusIcon className="action-drawer-icon" aria-hidden />
        ) : (
          <UserPlusIcon className="action-drawer-icon" aria-hidden />
        ),
        onSelect: () => void handleStandToggle(),
      });
      items.push({
        id: 'support',
        label: 'Support',
        leading: <GiftIcon className="action-drawer-icon" aria-hidden />,
        onSelect: () => {
          setSupportOpen(true);
          requestClose();
        },
      });
      items.push({
        id: 'endorse',
        label: 'Endorse',
        leading: <FireBIcon className="action-drawer-icon" aria-hidden />,
        onSelect: () => {
          requestClose();
          router.push(endorsementsHref, { scroll: false });
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
        leading: <TrashIcon className="action-drawer-icon" aria-hidden />,
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
      leading: <UserIcon className="action-drawer-icon" aria-hidden />,
      onSelect: () => requestClose(),
    });
    if (href) {
      items.push({
        id: 'copy-link',
        label: 'Copy link',
        leading: <CopyIcon className="action-drawer-icon" aria-hidden />,
        onSelect: () => void copyLink(),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showGestures,
    standLabel,
    viewerStanding,
    pending,
    isLoading,
    showCancelScarce,
    cancelScarcePending,
    href,
    profileHref,
    endorsementsHref,
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
          onClose={requestClose}
          onClosed={handleClosed}
          label="Post options"
          listAriaLabel="Post options"
          items={menuItems}
        />
      </div>
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
  const kind = post.kind;
  // Media speaks for itself — never badge image/video/audio.
  // Polls render their own card; skip the redundant "poll" pill.
  const hideKind =
    kind === 'text' ||
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    (hasPollEmbed && kind === 'poll');
  return [hideKind ? null : kind].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
}

/** `Replying to @x` / `Quoting @x` — muted context line instead of a pill. */
function postRelationContext(
  post: PostRow,
  hasQuoteInset: boolean
): { verb: string; handle: string } | null {
  if (post.parentPath) {
    const handle = post.parentAuthor ?? post.parentPath.split('/')[0];
    return handle ? { verb: 'Replying to', handle } : null;
  }
  // The quote inset already shows who's quoted — only label when it's absent.
  if (post.refPath && !hasQuoteInset) {
    const handle = post.refAuthor ?? post.refPath.split('/')[0];
    return handle ? { verb: 'Quoting', handle } : null;
  }
  return null;
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
      <Divider orientation="vertical" variant="green-detail" />
      <div className="post-card-quote-inset-content">
        <span className="post-card-quote-inset-head">
          <ProfileAvatar
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

function PostCardBody({
  relationContext,
  badges,
  text,
  hideText = false,
  hasMedia = false,
  /** Thread focus / detail — show full copy, no Show more. */
  expandDisabled = false,
}: {
  relationContext: { verb: string; handle: string } | null;
  badges: string[];
  text: string;
  /** When the poll card already shows the question, skip duplicate body text. */
  hideText?: boolean;
  hasMedia?: boolean;
  expandDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewLimit = postFeedPreviewLimit(hasMedia);
  const canExpand =
    !expandDisabled && !hideText && postPreviewNeedsExpand(text, previewLimit);
  const bodyText =
    canExpand && !expanded ? truncatePostPreview(text, previewLimit) : text;

  return (
    <>
      {relationContext ? (
        <span className="post-card-relation">
          {relationContext.verb}{' '}
          <Link
            href={portfolioPath(relationContext.handle)}
            className="os-mention post-card-relation-handle"
            scroll={false}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            @{relationContext.handle}
          </Link>
        </span>
      ) : null}
      {badges.length > 0 ? (
        <div className="post-card-badges">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      ) : null}
      {!hideText ? (
        <div className="post-card-body-block">
          <p className="post-card-body">
            <PostRichText text={bodyText} />
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
  quotedPost,
  quotedAuthorProfile,
  quotedHref,
  showRelationBadge = true,
  showChannel = false,
  channelLabel,
  showGuildAttribution = false,
  guildName,
  engagement,
  reactionPending,
  onToggleReaction,
  onAmplifyConfirmed,
  onReply,
  onQuote,
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
  const [amplifyOpen, setAmplifyOpen] = useState(false);
  const [listScarceOpen, setListScarceOpen] = useState(false);
  const [buyScarceOpen, setBuyScarceOpen] = useState(false);
  const [bidScarceOpen, setBidScarceOpen] = useState(false);
  const [feedMediumOpen, setFeedMediumOpen] = useState(false);
  const [feedMediumMode, setFeedMediumMode] =
    useState<ScarceFeedMediumMode>('viewer');
  const [feedMediumCoverSvg, setFeedMediumCoverSvg] = useState<string | null>(
    null
  );
  const [menuForceEmbed, setMenuForceEmbed] = useState(false);
  const [cancelScarcePending, setCancelScarcePending] = useState(false);
  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, post.accountId);
  const hasCollectionEmbed = Boolean(parsePostCollectionEmbed(post.value));
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
  // Own posts: fetch embed immediately so ⋮ already knows list vs cancel.
  // Skip fromPost resolve when this post is a Drop reference embed.
  const {
    rootRef: scarceEmbedRef,
    embed: fromPostScarceEmbed,
    retry: retryFromPostScarceEmbed,
  } = usePostScarceEmbed(post, {
    enabled: !hasCollectionEmbed,
    force: isSelf || menuForceEmbed,
  });
  const scarceEmbed = collectionEmbed ?? fromPostScarceEmbed;
  const scarceEmbedMergedRef = (node: HTMLElement | null) => {
    scarceEmbedRef.current = node;
    collectionEmbedRef.current = node;
  };
  const retryScarceEmbed = () => {
    retryCollectionEmbed();
    retryFromPostScarceEmbed();
  };
  const activelyListed =
    scarceEmbed?.status === 'lazy_listing' ||
    scarceEmbed?.status === 'listed' ||
    scarceEmbed?.status === 'auction';
  // Show List as soon as we don't know of an active listing. Waiting on
  // `ready` made the menu feel broken on own posts while indexer/contract
  // checks ran. Optimistic ledger + reconcile still flip to Cancel once
  // a listing is confirmed. Collection-reference posts are not listable
  // from the post (they point at an existing Drop / edition).
  const canListScarce =
    isConnected && isSelf && !hasCollectionEmbed && !activelyListed;
  const canCancelScarce =
    isConnected &&
    isSelf &&
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
  const poll = parsePostPollEmbed(post.value);
  const dropPaint = parseDropPaintSnapshot(post.value);
  const mediaItems = parsePostMedia(post.value);
  const hasMedia = mediaItems.length > 0;
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
  const dropListenTitle =
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
    ? postRelationContext(post, Boolean(quotedPost))
    : null;
  const profileHref = portfolioPath(post.accountId);
  const guildId = post.groupId?.trim() || null;
  const guildLabel =
    showGuildAttribution && guildId ? guildName?.trim() || guildId : null;
  const guildHref = guildId ? guildPath(guildId) : null;
  const detailTimestampIso = detailLayout
    ? postTimestampIso(post.blockTimestamp)
    : undefined;
  const cardClassName = [
    'post-card',
    // No rise-in here: feed skeletons morph in-place; translating up reads as content jump.
    actionHref ? 'post-card--openable' : '',
    detailLayout ? 'post-card--detail' : '',
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
      <Link
        href={profileHref}
        className="post-card-avatar-link"
        scroll={false}
        aria-label={`View ${name}'s profile`}
      >
        <ProfileAvatar
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
                  href={actionHref ?? postThreadPath(post)}
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
        <PostCardBody
          relationContext={relationContext}
          badges={badges}
          text={text}
          hasMedia={hasMedia}
          expandDisabled={mediaFocused}
          hideText={
            (Boolean(poll) && text === poll?.question) ||
            (mediaItems.length > 0 && !text.trim())
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
        {mediaItems.length > 0 ? (
          <PostMediaStrip
            items={mediaItems}
            size={mediaFocused ? 'page' : 'compact'}
            focused={mediaFocused}
            focusedVideoMuted={!mediaUnmuted}
            resumeFocusedVideo={mediaUnmuted}
            resumeMediaIndex={mediaResumeIndex}
            onActivate={
              !mediaFocused && actionHref && hasMedia
                ? (index) => {
                    const item = mediaItems[index];
                    const unmute = Boolean(
                      item && isRenderablePostVideoMime(item.mime)
                    );
                    router.push(
                      unmute
                        ? appendPostMediaUnmute(actionHref, index)
                        : appendPostMediaIndex(actionHref, index)
                    );
                  }
                : undefined
            }
          />
        ) : showScarceArt && scarceEmbed ? (
          <ScarcePostPreview
            post={post}
            variant="feed"
            mediaUrl={scarceCoverUrl}
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
        {quotedPost ? (
          <QuotedPostInset
            post={quotedPost}
            authorProfile={quotedAuthorProfile}
            href={quotedHref}
          />
        ) : null}
        {scarceEmbed || canListScarce ? (
          <PostScarceCta
            embed={
              scarceEmbed ?? {
                status: 'none',
                events: [],
              }
            }
            isAuthor={isSelf}
            authorAccountId={
              scarceEmbed?.creatorId?.trim() || post.accountId
            }
            canList={canListScarce}
            onList={() => setListScarceOpen(true)}
            onBuy={() => setBuyScarceOpen(true)}
            onBid={() => setBidScarceOpen(true)}
            listenSlot={
              showDropListen ? (
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
              ) : null
            }
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
          <div className="post-card-engagement">
            <EngagementStat
              icon={<MessageRoundIcon aria-hidden />}
              count={engagement.replyCount}
              label="replies"
              tone="reply"
              actionLabel={onReply ? 'Reply to this post' : undefined}
              onActivate={onReply ? () => onReply(post) : undefined}
            />
            <EngagementStat
              icon={<RepeatIcon aria-hidden />}
              count={engagement.quoteCount}
              label="quotes"
              tone="quote"
              actionLabel={onQuote ? 'Quote this post' : undefined}
              onActivate={onQuote ? () => onQuote(post) : undefined}
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
                engagement.viewerAmplified
                  ? 'Amplify again'
                  : 'Amplify this post'
              }
              onActivate={() => setAmplifyOpen(true)}
            />
          </div>
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
      />
      <ScarceBuySheet
        open={buyScarceOpen}
        post={buyScarceOpen ? post : null}
        authorName={authorProfile?.displayName}
        embed={scarceEmbed}
        onOpenChange={setBuyScarceOpen}
        onPurchased={() => retryScarceEmbed()}
      />
      <ScarceBidSheet
        open={bidScarceOpen}
        post={bidScarceOpen ? post : null}
        authorName={authorProfile?.displayName}
        embed={scarceEmbed}
        onOpenChange={setBidScarceOpen}
        onBid={() => retryScarceEmbed()}
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
      />
    </article>
  );
}

export { postKey };
