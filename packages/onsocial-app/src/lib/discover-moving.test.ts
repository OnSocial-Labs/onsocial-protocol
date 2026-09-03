import { describe, expect, it } from 'vitest';
import {
  orderRowsByAccountIds,
  postHasAmplifyHeat,
  recentPosterIds,
  selectHotPosts,
} from './discover-moving';
import type { PostRow } from '@onsocial/sdk';

function post(
  accountId: string,
  postId: string,
  amplifyHeat?: number
): PostRow {
  return {
    accountId,
    postId,
    value: '{}',
    blockHeight: 1,
    blockTimestamp: 1,
    amplifyHeat,
  };
}

describe('discover-moving', () => {
  it('treats missing or zero heat as cold', () => {
    expect(postHasAmplifyHeat(post('a.near', '1'))).toBe(false);
    expect(postHasAmplifyHeat(post('a.near', '1', 0))).toBe(false);
    expect(postHasAmplifyHeat(post('a.near', '1', 0.4))).toBe(true);
  });

  it('drops chrono fallback posts from Hot', () => {
    expect(
      selectHotPosts([
        post('cold.near', '1', 0),
        post('hot.near', '2', 1.2),
        post('also.near', '3'),
      ]).map((row) => row.postId)
    ).toEqual(['2']);
  });

  it('lists recent posters once, in feed order', () => {
    expect(
      recentPosterIds(
        [
          post('alice.near', '1'),
          post('bob.near', '2'),
          post('alice.near', '3'),
          post('cara.near', '4'),
        ],
        2
      )
    ).toEqual(['alice.near', 'bob.near']);
  });

  it('reorders profile rows to match poster ids', () => {
    expect(
      orderRowsByAccountIds(
        [
          { accountId: 'bob.near' },
          { accountId: 'alice.near' },
        ],
        ['alice.near', 'cara.near', 'bob.near']
      ).map((row) => row.accountId)
    ).toEqual(['alice.near', 'bob.near']);
  });
});
