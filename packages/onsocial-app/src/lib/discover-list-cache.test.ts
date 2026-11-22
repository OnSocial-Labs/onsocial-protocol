import { describe, expect, it } from 'vitest';
import * as discoverListCacheApi from './discover-list-cache';
import {
  clearDiscoverListCacheForTests,
  discoverListCacheKey,
  readDiscoverListCache,
  writeDiscoverListCache,
} from './discover-list-cache';

describe('discoverListCacheKey', () => {
  it('includes query and viewer context', () => {
    expect(discoverListCacheKey('alice', 'viewer.near')).toBe(
      'discover:alice:viewer.near:all:__any__:__any__'
    );
    expect(discoverListCacheKey('', null)).toBe(
      'discover:__all__:__anon__:all:__any__:__any__'
    );
    expect(discoverListCacheKey('', null, 'hiring', 'Healthcare')).toBe(
      'discover:__all__:__anon__:hiring:Healthcare:__any__'
    );
    expect(discoverListCacheKey('', null, 'all', 'Healthcare', 'Design')).toBe(
      'discover:__all__:__anon__:all:Healthcare:Design'
    );
  });
});

describe('discover list cache', () => {
  it('stores and reads entries by key', () => {
    clearDiscoverListCacheForTests();
    const key = discoverListCacheKey('', 'viewer.near');
    writeDiscoverListCache(key, {
      viewerAccountId: 'viewer.near',
      profiles: [],
      hasMore: false,
    });

    expect(readDiscoverListCache(key)).toEqual({
      viewerAccountId: 'viewer.near',
      profiles: [],
      hasMore: false,
    });
  });
});

/** Matches DISCOVER_LIST_CACHE_MAX — one face/filter/search pass. */
const DISCOVER_LIST_CACHE_MAX = 36;

const discoverEntry = {
  viewerAccountId: null,
  profiles: [],
  hasMore: false,
};

describe('discover list cache bound', () => {
  it('evicts the oldest entry past the cap', () => {
    clearDiscoverListCacheForTests();
    const published = (
      discoverListCacheApi as { DISCOVER_LIST_CACHE_MAX?: number }
    ).DISCOVER_LIST_CACHE_MAX;
    if (published !== undefined) {
      expect(published).toBe(DISCOVER_LIST_CACHE_MAX);
    }

    for (let i = 0; i < DISCOVER_LIST_CACHE_MAX + 1; i += 1) {
      writeDiscoverListCache(
        discoverListCacheKey(`q${i}`, null),
        discoverEntry
      );
    }
    expect(
      readDiscoverListCache(discoverListCacheKey('q0', null))
    ).toBeUndefined();
    expect(
      readDiscoverListCache(
        discoverListCacheKey(`q${DISCOVER_LIST_CACHE_MAX}`, null)
      )
    ).toEqual(discoverEntry);
  });

  it('refreshes LRU on read so a hot entry survives', () => {
    clearDiscoverListCacheForTests();
    const hot = discoverListCacheKey('hot', null, 'people');
    writeDiscoverListCache(hot, discoverEntry);
    for (let i = 0; i < DISCOVER_LIST_CACHE_MAX; i += 1) {
      expect(readDiscoverListCache(hot)).toEqual(discoverEntry);
      writeDiscoverListCache(
        discoverListCacheKey(`c${i}`, null),
        discoverEntry
      );
    }
    expect(readDiscoverListCache(hot)).toEqual(discoverEntry);
    expect(
      readDiscoverListCache(discoverListCacheKey('c0', null))
    ).toBeUndefined();
  });
});
