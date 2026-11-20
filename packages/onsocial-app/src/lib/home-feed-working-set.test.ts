import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import {
  HOME_FEED_TRIM_HEAD_PAD_BLOCKS,
  HOME_FEED_TRIM_NEAR_TOP_PX,
  HOME_FEED_TRIM_TAIL_PAD_BLOCKS,
  HOME_FEED_WORKING_SET_POSTS,
  homeFeedDroppedHeightPx,
  planHomeFeedMemoryTrim,
  trimHomeFeedWorkingSet,
  trimHomeFeedWorkingSetAroundWindow,
  trimHomeFeedWorkingSetKeepingHead,
} from './home-feed-working-set';

function row(postId: string, extra: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId,
    blockHeight: 1,
    blockTimestamp: 1,
    value: JSON.stringify({ text: postId }),
    ...extra,
  } as PostRow;
}

function ids(posts: readonly PostRow[]): string[] {
  return posts.map((post) => post.postId);
}

describe('trimHomeFeedWorkingSetKeepingHead', () => {
  it('keeps the newest head and drops the far-below tail', () => {
    const posts = Array.from({ length: 5 }, (_, i) => row(`p${i}`));
    const { posts: kept, dropped } = trimHomeFeedWorkingSetKeepingHead(
      posts,
      3
    );
    expect(kept.map((p) => p.postId)).toEqual(['p0', 'p1', 'p2']);
    expect(dropped.map((p) => p.postId)).toEqual(['p3', 'p4']);
  });

  it('is a no-op under the cap', () => {
    const posts = [row('a'), row('b')];
    expect(trimHomeFeedWorkingSetKeepingHead(posts, 10)).toEqual({
      posts,
      dropped: [],
    });
  });
});

describe('trimHomeFeedWorkingSet', () => {
  it('still drops the head for legacy callers / tests', () => {
    const posts = Array.from({ length: 5 }, (_, i) => row(`p${i}`));
    const { posts: kept, dropped } = trimHomeFeedWorkingSet(posts, 3);
    expect(kept.map((p) => p.postId)).toEqual(['p2', 'p3', 'p4']);
    expect(dropped.map((p) => p.postId)).toEqual(['p0', 'p1']);
  });

  it('defaults above the session persist size', () => {
    expect(HOME_FEED_WORKING_SET_POSTS).toBeGreaterThanOrEqual(120);
  });
});

describe('trimHomeFeedWorkingSetAroundWindow', () => {
  const posts = Array.from({ length: 10 }, (_, index) => row(`p${index}`));

  it('keeps the padded window and drops the side with more slack', () => {
    // Window blocks 4–6. Pads 2 / 4 would keep p2–p9 (8). Cap 5 drops the
    // extra tail slack first, then one more tail on the tie.
    const trimmed = trimHomeFeedWorkingSetAroundWindow(posts, {
      windowStart: 4,
      windowEnd: 6,
      headPad: 2,
      tailPad: 4,
      maxBlocks: 5,
    });
    expect(ids(trimmed.posts)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
    expect(ids(trimmed.droppedHead)).toEqual(['p0', 'p1']);
    expect(ids(trimmed.droppedTail)).toEqual(['p7', 'p8', 'p9']);
  });

  it('drops head slack when the window sits lower', () => {
    const trimmed = trimHomeFeedWorkingSetAroundWindow(posts, {
      windowStart: 6,
      windowEnd: 8,
      headPad: 4,
      tailPad: 1,
      maxBlocks: 4,
    });
    expect(ids(trimmed.posts)).toEqual(['p5', 'p6', 'p7', 'p8']);
    expect(ids(trimmed.droppedHead)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(ids(trimmed.droppedTail)).toEqual(['p9']);
  });

  it('keeps the window start when the visible range itself exceeds the cap', () => {
    const trimmed = trimHomeFeedWorkingSetAroundWindow(posts, {
      windowStart: 2,
      windowEnd: 8,
      headPad: 0,
      tailPad: 0,
      maxBlocks: 3,
    });
    expect(ids(trimmed.posts)).toEqual(['p2', 'p3', 'p4']);
    expect(ids(trimmed.droppedHead)).toEqual(['p0', 'p1']);
    expect(ids(trimmed.droppedTail)).toEqual(['p5', 'p6', 'p7', 'p8', 'p9']);
  });

  it('is a no-op when the coalesced block count is under the cap', () => {
    const parent = row('p0', { blockTimestamp: 1, blockHeight: 1 });
    const reply = row('p1', {
      blockTimestamp: 2,
      blockHeight: 2,
      parentPath: 'alice.near/post/p0',
      parentAuthor: 'alice.near',
    });
    const other = row('p2');
    const threaded = [reply, parent, other];
    const trimmed = trimHomeFeedWorkingSetAroundWindow(threaded, {
      windowStart: 0,
      windowEnd: 1,
      maxBlocks: 2,
    });
    expect(trimmed.posts).toBe(threaded);
    expect(trimmed.droppedHead).toEqual([]);
    expect(trimmed.droppedTail).toEqual([]);
  });

  it('is a no-op under the cap', () => {
    const short = [row('a'), row('b')];
    const trimmed = trimHomeFeedWorkingSetAroundWindow(short, {
      windowStart: 0,
      windowEnd: 1,
      maxBlocks: 10,
    });
    expect(trimmed).toEqual({
      posts: short,
      droppedHead: [],
      droppedTail: [],
    });
    expect(trimmed.posts).toBe(short);
  });
});

describe('planHomeFeedMemoryTrim', () => {
  it('keeps the head when the reader is still near the top', () => {
    const posts = Array.from({ length: 8 }, (_, index) => row(`p${index}`));
    const trimmed = planHomeFeedMemoryTrim({
      posts,
      scrollTop: HOME_FEED_TRIM_NEAR_TOP_PX,
      windowStart: 6,
      windowEnd: 8,
      max: 5,
    });
    expect(ids(trimmed.posts)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(trimmed.droppedHead).toEqual([]);
    expect(ids(trimmed.droppedTail)).toEqual(['p5', 'p6', 'p7']);
  });

  it('uses the window once the reader has scrolled down', () => {
    const posts = Array.from({ length: 10 }, (_, index) => row(`p${index}`));
    const trimmed = planHomeFeedMemoryTrim({
      posts,
      scrollTop: HOME_FEED_TRIM_NEAR_TOP_PX + 1,
      windowStart: 4,
      windowEnd: 6,
      max: 5,
    });
    expect(ids(trimmed.posts)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
    expect(ids(trimmed.droppedHead)).toEqual(['p0', 'p1']);
    expect(ids(trimmed.droppedTail)).toEqual(['p7', 'p8', 'p9']);
  });

  it('is a no-op under the cap', () => {
    const posts = [row('a'), row('b')];
    const trimmed = planHomeFeedMemoryTrim({
      posts,
      scrollTop: 4000,
      windowStart: 1,
      windowEnd: 2,
      max: 10,
    });
    expect(trimmed.posts).toBe(posts);
    expect(trimmed.droppedHead).toEqual([]);
    expect(trimmed.droppedTail).toEqual([]);
  });
});

describe('home feed trim bounds', () => {
  it('publishes the scroll-idle window pads', () => {
    expect(HOME_FEED_TRIM_NEAR_TOP_PX).toBe(480);
    expect(HOME_FEED_TRIM_HEAD_PAD_BLOCKS).toBe(20);
    expect(HOME_FEED_TRIM_TAIL_PAD_BLOCKS).toBe(40);
  });
});

describe('homeFeedDroppedHeightPx', () => {
  it('prefers measured cache heights over estimates', () => {
    const cache = new FeedWindowSizeCache();
    cache.set('alice.near:p0', 400);
    expect(homeFeedDroppedHeightPx([row('p0')], cache)).toBe(400);
  });
});
