import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  HOME_FEED_WORKING_SET_POSTS,
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

  it('defaults above the session persist size', () => {
    expect(HOME_FEED_WORKING_SET_POSTS).toBeGreaterThanOrEqual(120);
  });
});
