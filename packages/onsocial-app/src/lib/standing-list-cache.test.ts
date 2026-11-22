import { describe, expect, it } from 'vitest';
import * as standingListCacheApi from './standing-list-cache';
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

/** Matches STANDING_LIST_CACHE_MAX — 16 profiles × 3 kinds. */
const STANDING_LIST_CACHE_MAX = 48;

const standingEntry = {
  viewerAccountId: null,
  accounts: [],
  listTotal: 0,
  hasMore: false,
  counts: { incoming: 0, outgoing: 0, mutual: 0 },
};

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

  it('evicts the oldest entry past the cap', () => {
    clearStandingListCacheForTests();
    const published = (
      standingListCacheApi as { STANDING_LIST_CACHE_MAX?: number }
    ).STANDING_LIST_CACHE_MAX;
    if (published !== undefined) {
      expect(published).toBe(STANDING_LIST_CACHE_MAX);
    }

    for (let i = 0; i < STANDING_LIST_CACHE_MAX + 1; i += 1) {
      writeStandingListCache(
        standingListCacheKey(`acct${i}.near`, 'incoming', '', null),
        standingEntry
      );
    }
    expect(
      readStandingListCache(
        standingListCacheKey('acct0.near', 'incoming', '', null)
      )
    ).toBeUndefined();
    expect(
      readStandingListCache(
        standingListCacheKey(
          `acct${STANDING_LIST_CACHE_MAX}.near`,
          'incoming',
          '',
          null
        )
      )
    ).toEqual(standingEntry);
  });

  it('refreshes LRU on read so a hot entry survives', () => {
    clearStandingListCacheForTests();
    const hot = standingListCacheKey('hot.near', 'mutual', '', null);
    writeStandingListCache(hot, standingEntry);
    for (let i = 0; i < STANDING_LIST_CACHE_MAX; i += 1) {
      expect(readStandingListCache(hot)).toEqual(standingEntry);
      writeStandingListCache(
        standingListCacheKey(`cold${i}.near`, 'incoming', '', null),
        standingEntry
      );
    }
    expect(readStandingListCache(hot)).toEqual(standingEntry);
    expect(
      readStandingListCache(
        standingListCacheKey('cold0.near', 'incoming', '', null)
      )
    ).toBeUndefined();
  });
});
