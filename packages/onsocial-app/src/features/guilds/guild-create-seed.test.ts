import { beforeEach, describe, expect, it } from 'vitest';
import { seedCreatedGuildCaches } from '@/features/guilds/guild-create-seed';
import { DEFAULT_GUILD_STRUCTURE } from '@/features/guilds/guild-structure';
import {
  clearGuildMembershipCacheForTests,
  readGuildMembershipCache,
} from '@/lib/guild-membership-cache';
import {
  clearGuildPageCacheForTests,
  readGuildPageCache,
} from '@/lib/guild-page-cache';
import {
  clearGuildShellCacheForTests,
  readGuildShellCache,
} from '@/lib/guild-shell-cache';

describe('seedCreatedGuildCaches', () => {
  beforeEach(() => {
    clearGuildShellCacheForTests();
    clearGuildPageCacheForTests();
    clearGuildMembershipCacheForTests();
  });

  it('seeds shell, page, and membership caches for instant paint', () => {
    seedCreatedGuildCaches({
      groupId: 'builder-room',
      accountId: 'alice.near',
      name: 'Builder Room',
      description: 'Shipping weekly.',
      bannerCid: 'bafybanner',
      badgeCid: 'bafybadge',
      accessGated: true,
      memberDriven: false,
      topics: ['builders'],
    });

    const shell = readGuildShellCache('builder-room');
    expect(shell?.name).toBe('Builder Room');
    expect(shell?.bannerUrl).toContain('bafybanner');
    expect(shell?.badgeUrl).toContain('bafybadge');
    expect(shell?.accessGated).toBe(true);

    const page = readGuildPageCache('builder-room');
    expect(page?.config.ownerId).toBe('alice.near');
    expect(page?.config.name).toBe('Builder Room');
    expect(page?.config.topics).toEqual(['builders']);
    expect(page?.config.structure).toEqual(DEFAULT_GUILD_STRUCTURE);
    expect(page?.structureResolved).toBe(true);
    expect(page?.postCount).toBe(0);
    expect(page?.members).toEqual([]);

    expect(readGuildMembershipCache('alice.near', 'builder-room')).toEqual({
      isMember: true,
      joinPending: false,
    });
  });

  it('keeps media null and structure isolated when no uploads', () => {
    seedCreatedGuildCaches({
      groupId: 'open-hall',
      accountId: 'bob.near',
      name: 'Open Hall',
      description: '',
      accessGated: false,
      memberDriven: false,
      topics: [],
    });

    const shell = readGuildShellCache('open-hall');
    expect(shell?.bannerUrl).toBeNull();
    expect(shell?.badgeUrl).toBeNull();

    const page = readGuildPageCache('open-hall');
    expect(page?.config.structure).toEqual(DEFAULT_GUILD_STRUCTURE);
    expect(page?.config.structure).not.toBe(DEFAULT_GUILD_STRUCTURE);
  });
});
