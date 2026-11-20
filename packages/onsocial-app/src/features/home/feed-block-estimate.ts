import type { PostRow } from '@onsocial/sdk';
import {
  FEED_WINDOW_ESTIMATE_PX,
  FEED_WINDOW_FOLD_ESTIMATE_PX,
  FEED_WINDOW_JACKET_ESTIMATE_PX,
  FEED_WINDOW_MEDIA_ESTIMATE_PX,
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
  postFeedClosedLines,
  postFeedPreviewLimit,
} from '@/lib/post-display';
import { parsePostMedia } from '@/lib/post-media';
import { isRepostRefType } from '@/lib/post-relation';
import type { ThreadReplyRow } from '@/lib/thread-display';

/** Identity + engagement chrome under a one-line text body. */
const FEED_TEXT_BASE_PX = 168;
/**
 * Closed-body line height — `--os-post-body-size` (1rem) × leading (1.5).
 */
const FEED_TEXT_LINE_PX = 24;
/** ~chars that fit one closed feed line before wrap. */
const FEED_TEXT_CHARS_PER_LINE = 48;

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

/**
 * Preserve hard breaks for line count; collapse runs of spaces inside a
 * line only. `normalizePostPreviewText` flattens newlines and must not
 * feed the spacer math.
 */
function feedPreviewLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * Closed text-card height from the folded preview budget — short posts no
 * longer share the same 280px spacer as a full six-line body.
 */
export function feedTextEstimatePx(text: string, hasMedia: boolean): number {
  const limit = postFeedPreviewLimit(hasMedia);
  const closedLines = postFeedClosedLines(hasMedia);
  const linesRaw = feedPreviewLines(text);
  if (linesRaw.length === 0) return FEED_TEXT_BASE_PX;

  const charCount = linesRaw.reduce((sum, line) => sum + line.length, 0);
  // Full closed preview (or Show more) uses the legacy spacer.
  if (charCount >= limit || linesRaw.length > closedLines) {
    return FEED_WINDOW_ESTIMATE_PX;
  }

  let wrapped = 0;
  for (const line of linesRaw) {
    wrapped += Math.max(1, Math.ceil(line.length / FEED_TEXT_CHARS_PER_LINE));
  }
  const lines = Math.min(Math.max(linesRaw.length, wrapped), closedLines);
  const px = FEED_TEXT_BASE_PX + (lines - 1) * FEED_TEXT_LINE_PX;
  return Math.min(FEED_WINDOW_ESTIMATE_PX, px);
}

/**
 * Extra px when a media/jacket caption peeks past one closed line. The
 * flat media/jacket seats already budget identity + tile + ~one line.
 */
function feedCaptionExtraPx(text: string, hasMedia: boolean): number {
  const closed = postFeedClosedLines(hasMedia);
  const linesRaw = feedPreviewLines(text);
  if (linesRaw.length === 0) return 0;
  let wrapped = 0;
  for (const line of linesRaw) {
    wrapped += Math.max(1, Math.ceil(line.length / FEED_TEXT_CHARS_PER_LINE));
  }
  const lines = Math.min(Math.max(linesRaw.length, wrapped), closed);
  if (lines <= 1) return 0;
  return (lines - 1) * FEED_TEXT_LINE_PX;
}

function feedCardEstimatePx(post: PostRow, quotedPosts: QuoteMap): number {
  const card = feedEstimateCard(post, quotedPosts);
  const kind = feedCardEstimateKind(post, quotedPosts);
  const body = parsePostText(card.value);
  let px: number;
  if (kind === 'text') {
    px = feedTextEstimatePx(body, false);
  } else if (kind === 'media') {
    px = FEED_WINDOW_MEDIA_ESTIMATE_PX + feedCaptionExtraPx(body, true);
  } else if (kind === 'jacket') {
    px = FEED_WINDOW_JACKET_ESTIMATE_PX + feedCaptionExtraPx(body, true);
  } else {
    px = feedWindowRowEstimatePx(kind);
  }
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

/** Thread-page reply row — post card or fold coil. */
export function threadReplyRowEstimatePx(
  row: ThreadReplyRow,
  quotedPosts: QuoteMap = {}
): number {
  if (row.kind === 'more') return FEED_WINDOW_FOLD_ESTIMATE_PX;
  return feedCardEstimatePx(row.post, quotedPosts);
}
