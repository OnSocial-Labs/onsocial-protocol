import type { PostRow } from '@onsocial/sdk';
import {
  FEED_WINDOW_FOLD_ESTIMATE_PX,
  FEED_WINDOW_QUOTE_INSET_PX,
  feedWindowRowEstimatePx,
  type FeedWindowRowKind,
} from '@/features/home/feed-window';
import { isArticlePost } from '@/lib/article-post-payload';
import {
  FEED_THREAD_MAX_UNCOLLAPSED,
  FEED_THREAD_TAIL_VISIBLE,
  type CoalescedFeedBlock,
} from '@/lib/feed-threads';
import {
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
  parsePostPollEmbed,
  parsePostText,
  parsePostTokenEmbed,
} from '@/lib/post-display';
import { parsePostMedia } from '@/lib/post-media';
import { isRepostRefType } from '@/lib/post-relation';

type QuoteMap = Record<string, PostRow>;

/** Resolve the card body a feed row paints (bare repost → original). */
function feedEstimateCard(
  post: PostRow,
  quotedPosts: QuoteMap
): PostRow {
  if (
    !isRepostRefType(post.refType) ||
    parsePostText(post.value).trim() ||
    !post.refPath
  ) {
    return post;
  }
  return quotedPosts[post.refPath] ?? post;
}

function postHasJacket(card: PostRow): boolean {
  if (isArticlePost(card)) return true;
  if (parseDropPaintSnapshot(card.value)) return true;
  if (parsePostCollectionEmbed(card.value)) return true;
  if (parsePostTokenEmbed(card.value)) return true;
  return false;
}

function postHasMedia(card: PostRow): boolean {
  return parsePostMedia(card.value).length > 0;
}

function postHasQuoteRef(post: PostRow): boolean {
  return Boolean(post.refPath?.trim()) && !isRepostRefType(post.refType);
}

/**
 * One painted card's spacer kind. Jacket (scarce/article) beats media;
 * media beats poll; quote is last among content kinds.
 */
export function feedCardEstimateKind(
  post: PostRow,
  quotedPosts: QuoteMap
): FeedWindowRowKind {
  const card = feedEstimateCard(post, quotedPosts);
  if (postHasJacket(card)) return 'jacket';
  if (postHasMedia(card)) return 'media';
  if (parsePostPollEmbed(card.value) != null) return 'poll';
  if (postHasQuoteRef(post)) {
    const quoted = post.refPath ? quotedPosts[post.refPath] : undefined;
    if (quoted) {
      if (postHasJacket(quoted)) return 'jacket';
      if (postHasMedia(quoted)) return 'media';
    }
    return 'quote';
  }
  return 'text';
}

/** Solo-card kind — chains/peeks use {@link feedBlockEstimatePx}. */
export function feedBlockEstimateKind(
  block: Pick<CoalescedFeedBlock, 'posts' | 'standingPeek'>,
  quotedPosts: QuoteMap
): FeedWindowRowKind {
  if (block.posts.length !== 1 || block.standingPeek) return 'text';
  return feedCardEstimateKind(block.posts[0]!, quotedPosts);
}

/**
 * @deprecated Prefer {@link feedBlockEstimateKind} / {@link feedBlockEstimatePx}.
 * Kept for callers that still branch on poll vs everything else.
 */
export function personalFeedBlockEstimateKind(
  block: Pick<CoalescedFeedBlock, 'posts' | 'standingPeek'>,
  quotedPosts: QuoteMap
): FeedWindowRowKind {
  return feedBlockEstimateKind(block, quotedPosts);
}

export function feedBlockIsPollRow(
  block: Pick<CoalescedFeedBlock, 'posts' | 'standingPeek'>,
  quotedPosts: QuoteMap
): boolean {
  return (
    block.posts.length === 1 &&
    !block.standingPeek &&
    feedCardEstimateKind(block.posts[0]!, quotedPosts) === 'poll'
  );
}

/** @deprecated Prefer {@link feedBlockIsPollRow}. */
export function personalFeedBlockIsPollRow(
  block: Pick<CoalescedFeedBlock, 'posts' | 'standingPeek'>,
  quotedPosts: QuoteMap
): boolean {
  return feedBlockIsPollRow(block, quotedPosts);
}

function feedCardEstimatePx(post: PostRow, quotedPosts: QuoteMap): number {
  const card = feedEstimateCard(post, quotedPosts);
  const kind = feedCardEstimateKind(post, quotedPosts);
  let px = feedWindowRowEstimatePx(kind);
  // Own media/jacket + quote ref → tile/jacket plus QuotedPostInset under it.
  // Quote-of-media (kind bumped via quoted payload) already uses jacket/media
  // height for the inset face — do not add a second inset.
  if (
    postHasQuoteRef(post) &&
    (postHasMedia(card) || postHasJacket(card))
  ) {
    px += FEED_WINDOW_QUOTE_INSET_PX;
  }
  return px;
}

function visibleThreadPosts(posts: readonly PostRow[]): PostRow[] {
  if (posts.length <= FEED_THREAD_MAX_UNCOLLAPSED) return [...posts];
  return [posts[0]!, ...posts.slice(-FEED_THREAD_TAIL_VISIBLE)];
}

/**
 * Spacer px for one coalesced feed block — sums visible thread cards
 * (collapsed head + tail), folds, and standing peek. Matches
 * {@link FeedThreadBlock} paint geometry so media+reply no longer
 * undercounts as a short text row.
 */
export function feedBlockEstimatePx(
  block: Pick<
    CoalescedFeedBlock,
    'posts' | 'standingPeek' | 'standingHidden'
  >,
  quotedPosts: QuoteMap
): number {
  const posts = block.posts;
  if (posts.length === 0) return feedWindowRowEstimatePx('text');

  const collapsed = posts.length > FEED_THREAD_MAX_UNCOLLAPSED;
  let total = 0;
  for (const post of visibleThreadPosts(posts)) {
    total += feedCardEstimatePx(post, quotedPosts);
  }
  if (collapsed) total += FEED_WINDOW_FOLD_ESTIMATE_PX;
  if (block.standingPeek) {
    total += feedCardEstimatePx(block.standingPeek, quotedPosts);
  }
  if (block.standingHidden && block.standingHidden.length > 0) {
    total += FEED_WINDOW_FOLD_ESTIMATE_PX;
  }
  return total;
}

/** @deprecated Prefer {@link feedBlockEstimatePx}. */
export function personalFeedBlockEstimatePx(
  block: Pick<
    CoalescedFeedBlock,
    'posts' | 'standingPeek' | 'standingHidden'
  >,
  quotedPosts: QuoteMap
): number {
  return feedBlockEstimatePx(block, quotedPosts);
}
