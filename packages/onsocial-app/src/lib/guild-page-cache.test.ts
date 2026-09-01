import { beforeEach, describe, expect, it } from 'vitest';
import type { GuildConfigSnapshot } from '@/features/guilds/guild-config';
import { DEFAULT_GUILD_STRUCTURE } from '@/features/guilds/guild-structure';
import {
  clearGuildPageCacheForTests,
  filterGuildPostsForSpace,
  GUILD_FEED_CACHE_MAX,
  GUILD_PAGE_CACHE_MAX,
  guildFeedCacheKey,
  readGuildFeedCache,
  readGuildPageCache,
  writeGuildFeedCache,
  writeGuildPageCache,
} from './guild-page-cache';

const shell = {
  name: 'Social Rebels',
  bannerUrl: null as string | null,
  badgeUrl: null as string | null,
  accessGated: false,
  memberDriven: true,
  description: '',
  topics: [] as string[],
};

const config: GuildConfigSnapshot = {
  name: 'Social Rebels',
  description: '',
  bannerUrl: null,
  badgeUrl: null,
  ownerId: 'alice.near',
  accessGated: false,
  memberDriven: true,
  topics: [],
  structure: DEFAULT_GUILD_STRUCTURE,
};

const page = {
  config,
  shell,
  stats: null,
  indexedMemberCount: 4,
  members: [],
  postCount: 12,
  structureResolved: true,
};

describe('guildPageCache', () => {
  beforeEach(() => {
    clearGuildPageCacheForTests();
  });

  it('keys room feeds separately from the default feed', () => {
    expect(guildFeedCacheKey('dao')).toBe('dao::all');
    expect(guildFeedCacheKey('dao', 'general')).toBe('dao::general');
  });

  it('reads what it writes for page and feed', () => {
    writeGuildPageCache('dao', page);
    writeGuildFeedCache('dao', 'all', {
      posts: [{ accountId: 'alice.near', postId: '1' } as never],
      hasMore: true,
    });
    expect(readGuildPageCache('dao')?.indexedMemberCount).toBe(4);
    expect(readGuildFeedCache('dao', 'all')?.hasMore).toBe(true);
    expect(readGuildFeedCache('dao', 'general')).toBeUndefined();
  });

  it('evicts oldest page and feed entries independently', () => {
    for (let i = 0; i < GUILD_PAGE_CACHE_MAX + 2; i += 1) {
      writeGuildPageCache(`g${i}`, {
        ...page,
        shell: { ...shell, name: `Guild ${i}` },
      });
    }
    expect(readGuildPageCache('g0')).toBeUndefined();
    expect(readGuildPageCache(`g${GUILD_PAGE_CACHE_MAX + 1}`)?.shell.name).toBe(
      `Guild ${GUILD_PAGE_CACHE_MAX + 1}`
    );

    for (let i = 0; i < GUILD_FEED_CACHE_MAX + 2; i += 1) {
      writeGuildFeedCache(`f${i}`, 'all', { posts: [], hasMore: false });
    }
    expect(readGuildFeedCache('f0', 'all')).toBeUndefined();
    expect(
      readGuildFeedCache(`f${GUILD_FEED_CACHE_MAX + 1}`, 'all')?.hasMore
    ).toBe(false);
  });

  it('LRU-refreshes page entries on read', () => {
    writeGuildPageCache('hot', page);
    for (let i = 0; i < GUILD_PAGE_CACHE_MAX; i += 1) {
      expect(readGuildPageCache('hot')?.shell.name).toBe('Social Rebels');
      writeGuildPageCache(`c${i}`, {
        ...page,
        shell: { ...shell, name: `Cold ${i}` },
      });
    }
    expect(readGuildPageCache('hot')?.shell.name).toBe('Social Rebels');
  });

  it('filters the default feed to a room without another round-trip', () => {
    const general = DEFAULT_GUILD_STRUCTURE.spaces[0];
    const posts = [
      { accountId: 'a.near', postId: '1', channel: 'general' },
      { accountId: 'a.near', postId: '2', channel: 'announcements' },
    ] as never as import('@onsocial/sdk').PostRow[];
    expect(
      filterGuildPostsForSpace(posts, general).map((post) => post.postId)
    ).toEqual(['1']);
    expect(filterGuildPostsForSpace(posts, null)).toHaveLength(2);
  });
});
