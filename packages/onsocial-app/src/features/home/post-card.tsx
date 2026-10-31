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
import {
  postContentPath,
  type PostRow,
  type PostScarceEmbed,
} from '@onsocial/sdk';
import { RepeatIcon, UsersFillIcon } from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { QuotedPostInset } from '@/features/home/post-card-quote';
import {
  PostEngagementRow,
  PostPeekStandButton,
  type PostEngagementRowBaseProps,
} from '@/features/home/post-card-engagement';
import {
  PostCardMenu,
  type PostCardMenuPostProps,
} from '@/features/home/post-card-menu';
import { PostCardBody, postBadges } from '@/features/home/post-card-body';
import {
  hasReachableMediaFace,
  onDismissReplyDrawers,
  revealOpenMediaFace,
  setMediaFacesYielded,
} from '@/lib/media-face-session';
import { displayName } from '@/lib/profile-display';
import { downloadIpfsMedia } from '@/lib/media-download';
import { PostAmplifySheet } from '@/features/home/post-amplify-sheet';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { isArticlePost } from '@/lib/article-post-payload';
import { type WriteDockSubmit } from '@/contexts/compose-launcher-context';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import {
  arePostAuthorProfilesResolved,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
import { guildPath } from '@/features/guilds/guilds-data';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { warmThreadOpen } from '@/lib/thread-first-page';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { WritingReadDocument } from '@/features/scarces/scarce-writing-read-sheet';
import { FeedArticleReadScreen } from '@/features/home/feed-article-read-screen';
import { FeedPhotoEnlargeScreen } from '@/features/home/feed-photo-enlarge-screen';
import {
  zoomOriginFromTile,
  type FeedPhotoZoomOrigin,
} from '@/features/home/feed-photo-zoom';
import { PostMediaStrip } from '@/features/home/post-media';
import { PostPollEmbedCard } from '@/features/home/post-poll-embed';
import { PostSensitiveGate } from '@/features/home/post-sensitive-gate';
import {
  canCancelPostScarce,
  cancelPostScarceListing,
} from '@/features/scarces/cancel-post-scarce';
import {
  PostScarceCta,
  type PostScarceCtaActionProps,
} from '@/features/scarces/post-scarce-cta';
import {
  isWritingFolioFormat,
  resolveDropReadTarget,
} from '@/features/scarces/drop-writing';
import {
  peekDropRead,
  prefetchDropRead,
  type DropReadAhead,
} from '@/features/scarces/drop-read-ahead';
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
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
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
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';
import { parsePostContentLabels } from '@/lib/post-content-labels';
import { accountIdsEqual } from '@/lib/account-match';
import { consumeEssayReopen } from '@/lib/essay-return';
import { portfolioPath, writingArticlePath } from '@/lib/overlay-routes';
import {
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
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  formatPostTimestamp,
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
  parsePostPollEmbed,
  parsePostText,
  parsePostTokenEmbed,
  postKey,
  postTimestampIso,
} from '@/lib/post-display';
import { isRepostRefType, postRelationContext } from '@/lib/post-relation';
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

/** Engagement data + per-post actions a feed host wires into the card. */
export interface PostCardEngagementProps {
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
}

/** Poll tally + vote wiring for an embedded poll. */
export interface PostCardPollProps {
  pollTally?: PollTally;
  pollVotePending?: boolean;
  onPollVote?: (post: PostRow, optionIndex: number) => void;
}

/** Focused-media playback options (thread root / detail deep links). */
export interface PostCardMediaProps {
  /** Thread root — page-sized focused media playback. */
  mediaFocused?: boolean;
  /**
   * Ancestor or reply in a thread. The video plays muted and keeps a
   * speaker, so sound can come on without opening the full page.
   */
  videoSoundControl?: boolean;
  /** Hide photo / video / cover — used when the film already sits above. */
  hideMedia?: boolean;
  /** Detail opened with `?media=unmute` — resume video with sound. */
  mediaUnmuted?: boolean;
  /** Collage tile index to unmute (`?mi=`). */
  mediaResumeIndex?: number;
}

/** Compact inset preview of the post this one quotes. */
export interface PostCardQuoteProps {
  quotedPost?: PostRow;
  quotedAuthorProfile?: PostAuthorProfile;
  /** Click-through to the quoted post's own page. */
  quotedHref?: string;
}

interface PostCardProps
  extends PostCardEngagementProps,
    PostCardPollProps,
    PostCardMediaProps,
    PostCardQuoteProps {
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
  /** Stack the ⋮ menu above a host sheet (media-face thread drawer). */
  menuZIndex?: number;
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
  /**
   * This card is a post already above the one on screen. Opening it, or its
   * video / audio, returns to that post. It does not stack another sheet.
   */
  returnToPost?: boolean;
}

export {
  HOME_FEED_APPEND_SKELETON_FRAMES,
  HOME_FEED_COLD_SKELETON_FRAMES,
  PostRowSkeleton,
} from '@/features/home/post-skeleton';
export type { PostSkeletonFrame } from '@/features/home/post-skeleton';

/**
 * Mount an overlay sheet on first open and keep it mounted afterwards —
 * closed sheets cost nothing until first use, while close animations and
 * internal state survive later closes.
 */
function useSheetMounted(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted || open;
}

/** Shared fallback so the scarce-CTA bundle keeps a stable embed identity. */
const EMPTY_SCARCE_EMBED: PostScarceEmbed = {
  status: 'none',
  events: [],
};

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
  videoSoundControl = false,
  hideMedia = false,
  menuZIndex,
  mediaUnmuted = false,
  mediaResumeIndex = 0,
  detailLayout = false,
  preferActionHref = false,
  returnToPost = false,
  sheetContext = null,
}: PostCardProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const { openPostThread } = usePostThreadLayer();
  const ownerZ = usePostLayerOwnerZ();
  const actionZ = postLayerOverlayZ(ownerZ).sheet;
  const resolvedMenuZ =
    ownerZ == null ? menuZIndex : Math.max(menuZIndex ?? 0, actionZ);
  const interceptOpenHref = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string) => {
      if (detailLayout) return;
      if (!isUnmodifiedPrimaryClick(event)) return;
      if (!isAppPostSheetHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      openPostThread({
        href,
        root: post,
        context: sheetContext,
        rootEngagement: engagement,
        returnToPost,
      });
    },
    [detailLayout, engagement, openPostThread, post, returnToPost, sheetContext]
  );
  const interceptOpenNavigate = useCallback(
    (event: { preventDefault(): void }, href: string) => {
      if (detailLayout) return;
      if (!isAppPostSheetHref(href)) return;
      event.preventDefault();
      openPostThread({
        href,
        root: post,
        context: sheetContext,
        rootEngagement: engagement,
        returnToPost,
      });
    },
    [detailLayout, engagement, openPostThread, post, returnToPost, sheetContext]
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
  const [coverPlayNonce, setCoverPlayNonce] = useState(0);
  const [mediumEpoch, setMediumEpoch] = useState(0);
  const [feedMediumMode, setFeedMediumMode] =
    useState<ScarceFeedMediumMode>('viewer');
  const [feedMediumCoverSvg, setFeedMediumCoverSvg] = useState<string | null>(
    null
  );
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const facePhotoIndexRef = useRef(0);
  const handleFacePhotoIndex = useCallback((next: number) => {
    facePhotoIndexRef.current = next;
  }, []);
  /** Tapped thumbnail the enlarge face zooms out of (still photos only). */
  const [photoZoomOrigin, setPhotoZoomOrigin] =
    useState<FeedPhotoZoomOrigin | null>(null);
  /** Mood / craft article — slide-over reader (stays on feed). */
  const [articleOpen, setArticleOpen] = useState(false);
  // Nine overlays sit under every card; mount each on first open only.
  const amplifySheetMounted = useSheetMounted(amplifyOpen);
  const listScarceSheetMounted = useSheetMounted(listScarceOpen);
  const buyScarceSheetMounted = useSheetMounted(buyScarceOpen);
  const bidScarceSheetMounted = useSheetMounted(bidScarceOpen);
  const transferScarceSheetMounted = useSheetMounted(transferScarceOpen);
  const sellScarceSheetMounted = useSheetMounted(sellScarceOpen);
  const feedMediumSheetMounted = useSheetMounted(feedMediumOpen);
  const photoScreenMounted = useSheetMounted(photoOpen);
  const articleScreenMounted = useSheetMounted(articleOpen);
  /** Shared drop whose essay lives on another post. */
  const [feedReadEssay, setFeedReadEssay] = useState<PostRow | null>(null);
  const [feedBookRead, setFeedBookRead] = useState(false);
  const [feedBookCoverSvg, setFeedBookCoverSvg] = useState<string | null>(null);
  /** Reader is up; the drop's writing record has not chosen essay vs book yet. */
  const [feedReadPending, setFeedReadPending] = useState(false);
  /** Chapters for a resale book, loaded with the card. */
  const [dropReadPack, setDropReadPack] = useState<DropReadAhead | null>(null);
  const feedReadAuthors = usePostAuthorProfiles(
    feedReadEssay ? [feedReadEssay.accountId] : []
  );
  const dropReadTicket = useRef(0);
  /** Collection card already asked for writing. The open reader waits for that. */
  const dropReadAwaitingMeta = useRef(false);
  /** Article cover still when it isn’t already in post media. */
  const [enlargeOverride, setEnlargeOverride] = useState<
    PostMediaItem[] | null
  >(null);
  /** Reply on an open photo, drop, player, or writing — same thread drawer. */
  const [photoThreadOpen, setPhotoThreadOpen] = useState(false);
  const openPhotoThread = useCallback(() => {
    warmThreadOpen(postContentPath(post), post.groupId ? 'guild' : 'personal');
    setPhotoThreadOpen(true);
  }, [post]);
  const dismissPhotoThread = useCallback(() => {
    setPhotoThreadOpen(false);
  }, []);
  useEffect(() => onDismissReplyDrawers(dismissPhotoThread), [dismissPhotoThread]);
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
    status: collectionEmbedStatus,
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
  const dropReadables =
    collectionReadables.length > 0
      ? collectionReadables
      : (dropReadPack?.readables ?? []);
  const dropBookPdf = collectionBookPdf ?? dropReadPack?.bookPdf ?? null;
  const dropWritingFormat =
    collectionWritingFormat ?? dropReadPack?.writingFormat ?? null;
  const dropListenTitle =
    tokenDropTitle?.trim() ||
    collectionDropTitle?.trim() ||
    dropPaint?.title?.trim() ||
    'Drop';
  const openFeedMedium = (
    mode: ScarceFeedMediumMode,
    coverSvg: string | null = null
  ) => {
    if (revealOpenMediaFace(post.accountId, post.postId)) return;
    const stuck =
      feedMediumOpen &&
      feedMediumMode === mode &&
      !hasReachableMediaFace(post.accountId, post.postId);
    const already = feedMediumOpen && feedMediumMode === mode && !stuck;
    setMediaFacesYielded(false);
    setFeedMediumMode(mode);
    setFeedMediumCoverSvg(coverSvg);
    setFeedMediumOpen(true);
    if (stuck) {
      setMediumEpoch((epoch) => epoch + 1);
      return;
    }
    if (!already) return;
    setCoverPlayNonce((n) => n + 1);
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
    dropReadAwaitingMeta.current = false;
    setFeedReadPending(false);
    setFeedReadEssay(next?.essay ?? null);
    setFeedBookRead(Boolean(next?.book));
    setFeedBookCoverSvg(next?.coverSvg ?? null);
    setArticleOpen(true);
  };
  const applyDropReadRef = useRef<
    (
      writingFormat: typeof collectionWritingFormat,
      sourcePostPath: string | null,
      coverSvg: string | null,
      ticket: number
    ) => void
  >(() => {});
  applyDropReadRef.current = (
    writingFormat,
    sourcePostPath,
    coverSvg,
    ticket
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
    setFeedReadPending(true);
    setFeedBookRead(false);
    setFeedReadEssay(null);
    setArticleOpen(true);
    void (async () => {
      try {
        const essay = await fetchPersonalPost({
          author: target.author,
          postId: target.postId,
        });
        if (ticket !== dropReadTicket.current) return;
        if (essay && isArticlePost(essay)) {
          openFeedPostReader({ essay, coverSvg });
          return;
        }
      } catch {
        /* book pages below */
      }
      if (ticket !== dropReadTicket.current) return;
      openFeedPostReader({ book: true, coverSvg });
    })();
  };
  const finishDropReadRef = useRef<
    (
      ahead: DropReadAhead | null,
      coverSvg: string | null,
      ticket: number
    ) => void
  >(() => {});
  finishDropReadRef.current = (ahead, coverSvg, ticket) => {
    if (ticket !== dropReadTicket.current) return;
    if (ahead?.essay) {
      setDropReadPack(null);
      openFeedPostReader({ essay: ahead.essay, coverSvg });
      return;
    }
    if (ahead && (ahead.readables.length > 0 || ahead.bookPdf)) {
      setDropReadPack(ahead);
    }
    applyDropReadRef.current(
      ahead?.writingFormat ?? collectionWritingFormat,
      ahead?.sourcePostPath ??
        (collectionWritingSettled ? collectionSourcePostPath : null) ??
        dropPaint?.sourcePostPath ??
        null,
      coverSvg,
      ticket
    );
  };
  /**
   * Cover and Read share this. If the card already loaded the essay,
   * the page opens with it. Otherwise the shell is up and that same
   * load paints the page once.
   */
  const openDropWriting = (coverSvg: string | null = null) => {
    const ticket = ++dropReadTicket.current;

    if (article && !isWritingFolioFormat(collectionWritingFormat)) {
      openFeedPostReader();
      return;
    }

    const collectionId = scarceEmbed?.collectionId?.trim() || '';
    const ahead = collectionId ? peekDropRead(collectionId) : null;
    if (ahead) {
      finishDropReadRef.current(ahead, coverSvg, ticket);
      return;
    }

    setFeedBookCoverSvg(coverSvg);
    setFeedReadEssay(null);
    setFeedBookRead(false);
    setFeedReadPending(true);
    setArticleOpen(true);

    if (!collectionId) {
      finishDropReadRef.current(null, coverSvg, ticket);
      return;
    }

    if (
      hasCollectionEmbed &&
      !collectionWritingSettled &&
      collectionEmbedStatus !== 'error'
    ) {
      dropReadAwaitingMeta.current = true;
      return;
    }

    const meta = collectionWritingSettled
      ? {
          writingFormat: collectionWritingFormat,
          sourcePostPath:
            collectionSourcePostPath ?? dropPaint?.sourcePostPath ?? null,
        }
      : null;
    void prefetchDropRead({ collectionId, meta })
      .then((next) => {
        finishDropReadRef.current(next, coverSvg, ticket);
      })
      .catch(() => {
        finishDropReadRef.current(null, coverSvg, ticket);
      });
  };
  useEffect(() => {
    if (!articleOpen || !dropReadAwaitingMeta.current) return;
    if (!collectionWritingSettled && collectionEmbedStatus !== 'error') return;
    const ticket = dropReadTicket.current;
    const coverSvg = feedBookCoverSvg;
    const collectionId = scarceEmbed?.collectionId?.trim() || '';
    dropReadAwaitingMeta.current = false;
    if (!collectionId) {
      finishDropReadRef.current(null, coverSvg, ticket);
      return;
    }
    void prefetchDropRead({
      collectionId,
      meta: collectionWritingSettled
        ? {
            writingFormat: collectionWritingFormat,
            sourcePostPath:
              collectionSourcePostPath ?? dropPaint?.sourcePostPath ?? null,
          }
        : null,
    })
      .then((ahead) => {
        finishDropReadRef.current(ahead, coverSvg, ticket);
      })
      .catch(() => {
        finishDropReadRef.current(null, coverSvg, ticket);
      });
  }, [
    articleOpen,
    collectionEmbedStatus,
    collectionSourcePostPath,
    collectionWritingFormat,
    collectionWritingSettled,
    dropPaint?.sourcePostPath,
    feedBookCoverSvg,
    scarceEmbed?.collectionId,
  ]);
  useEffect(() => {
    const collectionId = scarceEmbed?.collectionId?.trim() || '';
    if (!collectionId) return;
    if (article && !isWritingFolioFormat(collectionWritingFormat)) return;
    if (hasCollectionEmbed) {
      if (!collectionWritingSettled) return;
      const target = resolveDropReadTarget({
        articleOnPost: Boolean(article),
        writingFormat: collectionWritingFormat,
        sourcePostPath:
          collectionSourcePostPath ?? dropPaint?.sourcePostPath ?? null,
      });
      if (target.kind !== 'source') return;
      void prefetchDropRead({
        collectionId,
        meta: {
          writingFormat: collectionWritingFormat,
          sourcePostPath:
            collectionSourcePostPath ?? dropPaint?.sourcePostPath ?? null,
        },
      }).catch(() => {});
      return;
    }
    if (!postDropIsReadable(scarceEmbed)) return;
    void prefetchDropRead({ collectionId, meta: null }).catch(() => {});
  }, [
    article,
    collectionSourcePostPath,
    collectionWritingFormat,
    collectionWritingSettled,
    dropPaint?.sourcePostPath,
    hasCollectionEmbed,
    scarceEmbed,
  ]);
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
  const badges = postBadges(post, Boolean(poll));
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

  /*
   * Bundle the props drilled to repeated children so memoized rows/menus
   * skip shell re-renders they don't care about (sheet opens, photo nav).
   */
  const openAmplify = useCallback(() => setAmplifyOpen(true), []);
  const openListScarce = useCallback(() => setListScarceOpen(true), []);
  const openSellScarce = useCallback(() => setSellScarceOpen(true), []);
  const openTransferScarce = useCallback(() => setTransferScarceOpen(true), []);
  const openBuyScarce = useCallback(() => setBuyScarceOpen(true), []);
  const openBidScarce = useCallback(() => setBidScarceOpen(true), []);
  // handleCancelScarce re-identifies per render; the menu only fires it on
  // interaction, so a ref trampoline keeps the bundle stable.
  const cancelScarceRef = useRef(handleCancelScarce);
  useEffect(() => {
    cancelScarceRef.current = handleCancelScarce;
  });
  const cancelScarceFromMenu = useCallback(() => {
    void cancelScarceRef.current();
  }, []);
  const handleMenuOpen = useCallback(() => {
    if (isSelf) setMenuForceEmbed(true);
  }, [isSelf]);
  // Overlay rows close their own sheet before running the shared action.
  const photoQuote = useCallback(
    (target: PostRow) => {
      setPhotoOpen(false);
      onQuote?.(target);
    },
    [onQuote]
  );
  const photoRepost = useCallback(
    (target: PostRow) => {
      setPhotoOpen(false);
      onRepost?.(target);
    },
    [onRepost]
  );
  const photoUndoRepost = useCallback(
    (target: PostRow) => {
      setPhotoOpen(false);
      onUndoRepost?.(target);
    },
    [onUndoRepost]
  );
  const articleQuote = useCallback(
    (target: PostRow) => {
      dropReadTicket.current += 1;
      dropReadAwaitingMeta.current = false;
      setFeedReadPending(false);
      setDropReadPack(null);
      setArticleOpen(false);
      onQuote?.(target);
    },
    [onQuote]
  );
  const articleRepost = useCallback(
    (target: PostRow) => {
      dropReadTicket.current += 1;
      dropReadAwaitingMeta.current = false;
      setFeedReadPending(false);
      setDropReadPack(null);
      setArticleOpen(false);
      onRepost?.(target);
    },
    [onRepost]
  );
  const articleUndoRepost = useCallback(
    (target: PostRow) => {
      dropReadTicket.current += 1;
      dropReadAwaitingMeta.current = false;
      setFeedReadPending(false);
      setDropReadPack(null);
      setArticleOpen(false);
      onUndoRepost?.(target);
    },
    [onUndoRepost]
  );
  const mediumQuote = useCallback(
    (target: PostRow) => {
      setFeedMediumOpen(false);
      onQuote?.(target);
    },
    [onQuote]
  );
  const mediumRepost = useCallback(
    (target: PostRow) => {
      setFeedMediumOpen(false);
      onRepost?.(target);
    },
    [onRepost]
  );
  const mediumUndoRepost = useCallback(
    (target: PostRow) => {
      setFeedMediumOpen(false);
      onUndoRepost?.(target);
    },
    [onUndoRepost]
  );

  const engagementActions = useMemo<
    Omit<PostEngagementRowBaseProps, 'engagement'>
  >(
    () => ({
      post,
      reactionPending,
      savePending,
      sharePending,
      onReply,
      onQuote,
      onRepost,
      onUndoRepost,
      onToggleReaction,
      onToggleSave,
    }),
    [
      post,
      reactionPending,
      savePending,
      sharePending,
      onReply,
      onQuote,
      onRepost,
      onUndoRepost,
      onToggleReaction,
      onToggleSave,
    ]
  );

  const scarceCtaActions = useMemo<PostScarceCtaActionProps>(
    () => ({
      embed: scarceEmbed ?? EMPTY_SCARCE_EMBED,
      isAuthor: isSelf,
      authorAccountId: scarceEmbed?.creatorId?.trim() || post.accountId,
      canList: canListScarce,
      onList: openListScarce,
      canSell: canSellScarce,
      onSell: openSellScarce,
      canTransfer: canTransferScarce,
      onTransfer: openTransferScarce,
      sellListed: sellListedScarce,
      alreadyOwnsEdition: Boolean(ownedScarceItem),
      onBuy: openBuyScarce,
      onBid: openBidScarce,
    }),
    [
      scarceEmbed,
      isSelf,
      post.accountId,
      canListScarce,
      openListScarce,
      canSellScarce,
      openSellScarce,
      canTransferScarce,
      openTransferScarce,
      sellListedScarce,
      ownedScarceItem,
      openBuyScarce,
      openBidScarce,
    ]
  );

  const menuPostProps = useMemo<PostCardMenuPostProps>(
    () => ({
      href: shareHref,
      accountId: post.accountId,
      authorProfile,
      canCancelScarce,
      onCancelScarce: cancelScarceFromMenu,
      cancelScarcePending,
    }),
    [
      shareHref,
      post.accountId,
      authorProfile,
      canCancelScarce,
      cancelScarceFromMenu,
      cancelScarcePending,
    ]
  );

  const mediaPeekIdentity = (
    <div className="feed-photo-caption-identity-row">
      <Link
        href={profileHref}
        className="os-media-face-identity"
        scroll={false}
        aria-label={`View ${name}'s profile`}
        onClick={() => {
          setPhotoOpen(false);
          setFeedMediumOpen(false);
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
      {!isSelf &&
      (photoOpen || (feedMediumOpen && feedMediumMode === 'audio')) ? (
        <PostPeekStandButton
          accountId={post.accountId}
          name={name}
          authorProfile={authorProfile}
        />
      ) : null}
    </div>
  );

  const dropEssayAuthorReady =
    !feedReadEssay || arePostAuthorProfilesResolved([feedReadEssay.accountId]);
  const showDropEssay = Boolean(feedReadEssay) && dropEssayAuthorReady;
  /** Shell is up. The essay page waits until its author face is known. */
  const dropReaderHolding =
    feedReadPending || (Boolean(feedReadEssay) && !dropEssayAuthorReady);

  return (
    <article className={cardClassName} ref={scarceEmbedMergedRef}>
      {openHref ? (
        <Link
          href={openHref}
          className="post-card-hit"
          scroll={false}
          onClick={(event) => interceptOpenHref(event, openHref)}
          onNavigate={(event) => interceptOpenNavigate(event, openHref)}
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
                    {...menuPostProps}
                    onMenuOpen={handleMenuOpen}
                    {...(resolvedMenuZ != null
                      ? { zIndex: resolvedMenuZ }
                      : {})}
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
            startExpanded={mediaFocused}
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
                  variant="article"
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
              soundControl={videoSoundControl}
              focusedVideoMuted={!mediaUnmuted}
              resumeFocusedVideo={mediaUnmuted}
              resumeMediaIndex={mediaResumeIndex}
              onActivate={
                hasMedia
                  ? (index, tile) => {
                      const action = resolveFeedMediaActivate(
                        mediaItems,
                        index
                      );
                      if (action.kind === 'enlarge') {
                        if (revealOpenMediaFace(post.accountId, post.postId)) {
                          return;
                        }
                        setMediaFacesYielded(false);
                        setEnlargeOverride(null);
                        setPhotoZoomOrigin(
                          zoomOriginFromTile(tile, action.mediaIndex)
                        );
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
              audio={showDropListen}
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
              {...scarceCtaActions}
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
            {...engagementActions}
            engagement={engagement}
            shareHref={shareHref}
            shareTitle={name}
            onAmplify={openAmplify}
            {...(resolvedMenuZ != null
              ? { shareDrawerZIndex: resolvedMenuZ }
              : {})}
          />
        ) : null}
      </div>
      {amplifySheetMounted ? (
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
          zIndex={actionZ}
        />
      ) : null}
      {listScarceSheetMounted ? (
        <ScarceListSheet
          open={listScarceOpen}
          post={listScarceOpen ? post : null}
          authorName={authorProfile?.displayName}
          onOpenChange={setListScarceOpen}
          onListed={() => retryScarceEmbed()}
          zIndex={actionZ}
        />
      ) : null}
      {buyScarceSheetMounted ? (
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
          zIndex={actionZ}
        />
      ) : null}
      {bidScarceSheetMounted ? (
        <ScarceBidSheet
          open={bidScarceOpen}
          post={bidScarceOpen ? post : null}
          authorName={authorProfile?.displayName}
          embed={scarceEmbed}
          onOpenChange={setBidScarceOpen}
          onBid={() => retryScarceEmbed()}
          zIndex={actionZ}
        />
      ) : null}
      {transferScarceSheetMounted ? (
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
          zIndex={actionZ}
        />
      ) : null}
      {sellScarceSheetMounted ? (
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
          zIndex={actionZ}
        />
      ) : null}
      {photoScreenMounted ? (
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
          onActiveIndexChange={handleFacePhotoIndex}
          peekIdentity={mediaPeekIdentity}
          caption={photoCaption}
          captionDate={
            post.blockTimestamp
              ? formatPostTimestamp(post.blockTimestamp)
              : null
          }
          photos={enlargePhotos}
          initialIndex={photoIndex}
          zoomOrigin={photoZoomOrigin}
          trailing={
            <PostCardMenu
              {...menuPostProps}
              besideStand
              openPostHref={postThreadPath(post)}
              onOpenPost={() => {
                setPhotoOpen(false);
                setPhotoThreadOpen(false);
              }}
              onDownload={
                enlargePhotos.length > 0
                  ? async () => {
                      const item = enlargePhotos[facePhotoIndexRef.current];
                      if (!item?.url) {
                        throw new Error('Could not download this file.');
                      }
                      await downloadIpfsMedia({
                        cid: item.cid,
                        url: item.url,
                        mime: item.mime || 'application/octet-stream',
                        title: enlargeTitle,
                        fallbackName: 'post',
                        exportFile: true,
                      });
                    }
                  : undefined
              }
              zIndex={actionZ}
            />
          }
          threadOpen={photoThreadOpen}
          onDismissThread={dismissPhotoThread}
          threadAuthor={post.accountId}
          threadPostId={post.postId}
          threadRoot={post}
          engagement={
            engagement ? (
              <PostEngagementRow
                {...engagementActions}
                engagement={engagement}
                shareHref={shareHref}
                shareTitle={name}
                onReply={openPhotoThread}
                onQuote={onQuote ? photoQuote : undefined}
                onRepost={onRepost ? photoRepost : undefined}
                onUndoRepost={onUndoRepost ? photoUndoRepost : undefined}
                onAmplify={openAmplify}
                shareDrawerZIndex={actionZ}
              />
            ) : null
          }
        />
      ) : null}
      {articleScreenMounted ? (
        <FeedArticleReadScreen
          open={articleOpen}
          onOpenChange={(next) => {
            setArticleOpen(next);
            if (!next) {
              dropReadTicket.current += 1;
              dropReadAwaitingMeta.current = false;
              setFeedReadPending(false);
              setFeedReadEssay(null);
              setFeedBookRead(false);
              setFeedBookCoverSvg(null);
              setDropReadPack(null);
              setPhotoThreadOpen(false);
            }
          }}
          post={showDropEssay ? feedReadEssay! : post}
          authorProfile={
            showDropEssay
              ? feedReadAuthors[feedReadEssay!.accountId]
              : authorProfile
          }
          documentTitle={
            feedBookRead || dropReaderHolding ? dropListenTitle : undefined
          }
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
                    readables={dropReadables}
                    bookPdf={dropBookPdf}
                    writingFormat={dropWritingFormat}
                    hydrateSettled
                    canRead
                    lockedHint=""
                    onChromeTap={onChromeTap}
                  />
                )
              : dropReaderHolding
                ? () => null
                : undefined
          }
          commerce={
            !isRepostShell && (scarceEmbed || canListScarce) ? (
              <PostScarceCta {...scarceCtaActions} />
            ) : null
          }
          engagement={
            engagement ? (
              <PostEngagementRow
                {...engagementActions}
                engagement={engagement}
                shareHref={shareHref}
                shareTitle={name}
                onReply={openPhotoThread}
                onQuote={onQuote ? articleQuote : undefined}
                onRepost={onRepost ? articleRepost : undefined}
                onUndoRepost={onUndoRepost ? articleUndoRepost : undefined}
                onAmplify={openAmplify}
                shareDrawerZIndex={actionZ}
              />
            ) : null
          }
        />
      ) : null}
      {feedMediumSheetMounted ? (
        <ScarceFeedMediumSheet
          key={mediumEpoch}
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
          feedEnlarge={feedMediumMode === 'audio'}
          coverPlayNonce={coverPlayNonce}
          peekIdentity={mediaPeekIdentity}
          caption={photoCaption}
          captionDate={
            post.blockTimestamp
              ? formatPostTimestamp(post.blockTimestamp)
              : null
          }
          trailing={
            /* Header disc. Stand stays on the caption for audio. */
            <PostCardMenu
              {...menuPostProps}
              besideStand={feedMediumMode === 'audio'}
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
              zIndex={actionZ}
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
              <PostScarceCta {...scarceCtaActions} />
            ) : null
          }
          engagement={
            engagement ? (
              <PostEngagementRow
                {...engagementActions}
                engagement={engagement}
                shareHref={shareHref}
                shareTitle={name}
                onReply={openPhotoThread}
                onQuote={onQuote ? mediumQuote : undefined}
                onRepost={onRepost ? mediumRepost : undefined}
                onUndoRepost={onUndoRepost ? mediumUndoRepost : undefined}
                onAmplify={openAmplify}
                shareDrawerZIndex={actionZ}
              />
            ) : null
          }
        />
      ) : null}
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
