import { describe, expect, it } from 'vitest';
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
    expect(
      discoverListCacheKey('', null, 'all', 'Healthcare', 'Design')
    ).toBe('discover:__all__:__anon__:all:Healthcare:Design');
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
