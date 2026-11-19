import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  quotedSeedFromFeedRows,
  publicCountsOnFeedRow,
} from './prepare-feed-paint';

function row(partial: Partial<PostRow> & Pick<PostRow, 'accountId' | 'postId'>): PostRow {
  return {
    value: '{}',
    blockHeight: 1,
    blockTimestamp: 1,
    ...partial,
  };
}

describe('quotedSeedFromFeedRows', () => {
  it('returns null until the paint columns are on the row', () => {
    expect(
      quotedSeedFromFeedRows([row({ accountId: 'a.near', postId: '1' })])
    ).toBeNull();
  });

  it('reads the quote and the repost hop from the row', () => {
    const quoted = row({
      accountId: 'b.near',
      postId: '2',
      refPath: 'c.near/post/3',
      replyCount: 4,
    });
    const inner = row({ accountId: 'c.near', postId: '3', replyCount: 1 });
    const posts = [
      row({
        accountId: 'a.near',
        postId: '1',
        refPath: 'b.near/post/2',
        replyCount: 0,
        quoteCount: 1,
        repostCount: 0,
        reactionCount: 2,
        quotedPost: quoted,
        quotedRefPost: inner,
      }),
    ];
    expect(quotedSeedFromFeedRows(posts)).toEqual({
      'b.near/post/2': quoted,
      'c.near/post/3': inner,
    });
    expect(publicCountsOnFeedRow(posts[0])).toEqual({
      replyCount: 0,
      quoteCount: 1,
      repostCount: 0,
      reactionCount: 2,
    });
  });

  it('accepts bigint counts as strings', () => {
    expect(
      publicCountsOnFeedRow(
        row({
          accountId: 'a.near',
          postId: '1',
          replyCount: '3',
          quoteCount: '0',
          repostCount: '1',
          reactionCount: '8',
        })
      )
    ).toEqual({
      replyCount: 3,
      quoteCount: 0,
      repostCount: 1,
      reactionCount: 8,
    });
  });
});
