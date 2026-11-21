import type { PostRow } from '@onsocial/sdk';
import {
  coalesceFeedThreads,
  type CoalesceFeedThreadsOptions,
  type CoalescedFeedBlock,
} from '@/lib/feed-threads';
import { HOME_FEED_SESSION_PERSISTED_POSTS } from '@/lib/home-feed-session';

/**
 * Cap for the live working set. Jump-to-newest trims the tail; deep scroll
 * uses {@link planHomeFeedMemoryTrim} after idle. Load-more never sync-trims
 * the head — that orphaned scroll-up. DOM windowing bounds render.
 */
export const HOME_FEED_WORKING_SET_POSTS = Math.max(
  120,
  HOME_FEED_SESSION_PERSISTED_POSTS * 2
);

/** Scroll offset at or above this stays on the jump-to-newest head trim. */
export const HOME_FEED_TRIM_NEAR_TOP_PX = 480;

/** Blocks kept above the visible window before the cap shrinks the range. */
export const HOME_FEED_TRIM_HEAD_PAD_BLOCKS = 20;

/** Blocks kept below the visible window before the cap shrinks the range. */
export const HOME_FEED_TRIM_TAIL_PAD_BLOCKS = 40;

/** Wait for scroll to settle before a deep-scroll memory trim. */
export const HOME_FEED_MEMORY_TRIM_IDLE_MS = 400;

export type TrimHomeFeedWorkingSetResult = {
  posts: PostRow[];
  /** Rows removed; 0 when under the cap. */
  dropped: PostRow[];
};

/** Rows kept and the posts that left above and below the window. */
export type HomeFeedMemoryTrimResult = {
  posts: PostRow[];
  droppedHead: PostRow[];
  droppedTail: PostRow[];
};

/**
 * Drop far-below (tail) rows once the list exceeds the working set.
 * Used after the reader jumps to newest — the head they landed on stays.
 */
export function trimHomeFeedWorkingSetKeepingHead(
  posts: readonly PostRow[],
  max: number = HOME_FEED_WORKING_SET_POSTS
): TrimHomeFeedWorkingSetResult {
  if (max <= 0 || posts.length <= max) {
    return { posts: posts as PostRow[], dropped: [] };
  }
  return {
    posts: posts.slice(0, max) as PostRow[],
    dropped: posts.slice(max) as PostRow[],
  };
}

export type HomeFeedAroundWindowTrimOptions = {
  /** Half-open block range the feed window is rendering. */
  windowStart: number;
  windowEnd: number;
  /** Block cap. Defaults to {@link HOME_FEED_WORKING_SET_POSTS}. */
  maxBlocks?: number;
  headPad?: number;
  tailPad?: number;
} & CoalesceFeedThreadsOptions;

function clampBlockBound(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  const index = Math.trunc(value);
  if (index < 0) return 0;
  if (index > max) return max;
  return index;
}

function blockMemberPosts(block: CoalescedFeedBlock): PostRow[] {
  const rows = [...block.posts];
  if (block.standingHidden?.length) rows.push(...block.standingHidden);
  if (block.standingPeek) rows.push(block.standingPeek);
  return rows;
}

/** Posts that belong to `blocks[from, to)`, in the original list order. */
function postsInBlocks(
  posts: readonly PostRow[],
  blocks: readonly CoalescedFeedBlock[],
  from: number,
  to: number
): PostRow[] {
  if (to <= from) return [];
  const members = new Set<PostRow>();
  for (let index = from; index < to; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    for (const post of blockMemberPosts(block)) members.add(post);
  }
  const kept: PostRow[] = [];
  for (const post of posts) {
    if (members.has(post)) kept.push(post);
  }
  return kept;
}

function noHomeFeedMemoryTrim(posts: readonly PostRow[]): HomeFeedMemoryTrimResult {
  return { posts: posts as PostRow[], droppedHead: [], droppedTail: [] };
}

/**
 * Keep the blocks around the rendered window, then shrink to `maxBlocks`.
 * The side with more slack outside the window loses rows first. Equal slack
 * drops the tail, and the window start stays — the row at the top of the
 * viewport is the one the reader is holding.
 */
export function trimHomeFeedWorkingSetAroundWindow(
  posts: readonly PostRow[],
  options: HomeFeedAroundWindowTrimOptions
): HomeFeedMemoryTrimResult {
  const maxBlocks = options.maxBlocks ?? HOME_FEED_WORKING_SET_POSTS;
  const headPad = Math.max(0, options.headPad ?? HOME_FEED_TRIM_HEAD_PAD_BLOCKS);
  const tailPad = Math.max(0, options.tailPad ?? HOME_FEED_TRIM_TAIL_PAD_BLOCKS);
  const blocks = coalesceFeedThreads([...posts], {
    includeForeignReplies: options.includeForeignReplies,
    stoodWithAccountIds: options.stoodWithAccountIds,
  });
  if (maxBlocks <= 0 || blocks.length <= maxBlocks) {
    return noHomeFeedMemoryTrim(posts);
  }

  const count = blocks.length;
  const start = clampBlockBound(options.windowStart, count);
  const endBound = clampBlockBound(options.windowEnd, count);
  const end = endBound < start ? start : endBound;

  let lo = Math.max(0, start - headPad);
  let hi = Math.min(count, end + tailPad);
  let excess = hi - lo - maxBlocks;
  if (excess > 0) {
    const headSlack = start - lo;
    const tailSlack = hi - end;
    if (headSlack > tailSlack) {
      const drop = Math.min(excess, headSlack - tailSlack);
      lo += drop;
      excess -= drop;
    } else if (tailSlack > headSlack) {
      const drop = Math.min(excess, tailSlack - headSlack);
      hi -= drop;
      excess -= drop;
    }
    if (excess > 0) {
      const slack = Math.max(0, start - lo);
      const headDrop = Math.min(slack, Math.floor(excess / 2));
      lo += headDrop;
      hi -= excess - headDrop;
    }
  }
  if (hi < lo) hi = lo;

  return {
    posts: postsInBlocks(posts, blocks, lo, hi),
    droppedHead: postsInBlocks(posts, blocks, 0, lo),
    droppedTail: postsInBlocks(posts, blocks, hi, count),
  };
}

export type HomeFeedMemoryTrimPlan = {
  posts: readonly PostRow[];
  scrollTop: number;
  windowStart: number;
  windowEnd: number;
  nearTopPx?: number;
  /** Post cap for the near-top path and the block cap once scrolled down. */
  max?: number;
} & CoalesceFeedThreadsOptions;

/**
 * Choose a memory trim. Near the top, keep the newest head. Deeper, keep
 * the rendered window. Under the cap, leave the list alone.
 */
export function planHomeFeedMemoryTrim(
  options: HomeFeedMemoryTrimPlan
): HomeFeedMemoryTrimResult {
  const max = options.max ?? HOME_FEED_WORKING_SET_POSTS;
  const nearTopPx = options.nearTopPx ?? HOME_FEED_TRIM_NEAR_TOP_PX;
  if (max <= 0 || options.posts.length <= max) {
    return noHomeFeedMemoryTrim(options.posts);
  }
  if (options.scrollTop <= nearTopPx) {
    const trimmed = trimHomeFeedWorkingSetKeepingHead(options.posts, max);
    return {
      posts: trimmed.posts,
      droppedHead: [],
      droppedTail: trimmed.dropped,
    };
  }
  return trimHomeFeedWorkingSetAroundWindow(options.posts, {
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
    maxBlocks: max,
    includeForeignReplies: options.includeForeignReplies,
    stoodWithAccountIds: options.stoodWithAccountIds,
  });
}

/** Head drops shift document flow — pair with a scroll-anchor restore. */
export function homeFeedMemoryTrimNeedsScrollAnchor(
  trimmed: Pick<HomeFeedMemoryTrimResult, 'droppedHead'>
): boolean {
  return trimmed.droppedHead.length > 0;
}

