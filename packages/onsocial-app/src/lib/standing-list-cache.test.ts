import { describe, expect, it } from 'vitest';
import {
  clearStandingListCacheForTests,
  readStandingListCache,
  standingListCacheKey,
  writeStandingListCache,
} from './standing-list-cache';

describe('standingListCacheKey', () => {
  it('includes account, kind, search query, and viewer context', () => {
    expect(
      standingListCacheKey('alice.near', 'incoming', 'bob', 'viewer.near')
    ).toBe('alice.near:incoming:bob:viewer.near');
    expect(standingListCacheKey('alice.near', 'outgoing', '', null)).toBe(
      'alice.near:outgoing:__all__:__anon__'
    );
  });
});

describe('standing list cache', () => {
  it('stores and reads entries by key', () => {
    clearStandingListCacheForTests();
    const key = standingListCacheKey('alice.near', 'mutual', '', 'viewer.near');
    writeStandingListCache(key, {
      viewerAccountId: 'viewer.near',
      accounts: [],
      listTotal: 0,
      hasMore: false,
    });

    expect(readStandingListCache(key)).toEqual({
      viewerAccountId: 'viewer.near',
      accounts: [],
      listTotal: 0,
      hasMore: false,
    });
  });
});
