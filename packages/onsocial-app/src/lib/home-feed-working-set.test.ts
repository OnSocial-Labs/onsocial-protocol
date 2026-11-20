import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import {
  HOME_FEED_WORKING_SET_POSTS,
  homeFeedDroppedHeightPx,
  trimHomeFeedWorkingSet,
  trimHomeFeedWorkingSetKeepingHead,
} from './home-feed-working-set';

function row(postId: string): PostRow {
  return {
    accountId: 'alice.near',
    postId,
    blockHeight: 1,
    blockTimestamp: 1,
    value: JSON.stringify({ text: postId }),
  } as PostRow;
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

describe('homeFeedDroppedHeightPx', () => {
  it('prefers measured cache heights over estimates', () => {
    const cache = new FeedWindowSizeCache();
    cache.set('alice.near:p0', 400);
    expect(homeFeedDroppedHeightPx([row('p0')], cache)).toBe(400);
  });
});
