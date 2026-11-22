import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import type { GuildFeedHeightSlot } from '@/lib/feed-window-height-retain';

const here = dirname(fileURLToPath(import.meta.url));

function row(postId: string): PostRow {
  return {
    accountId: 'alice.near',
    postId,
    blockHeight: 1,
    blockTimestamp: 1,
    value: JSON.stringify({ text: postId }),
  };
}

async function loadRetain(): Promise<
  typeof import('@/lib/feed-window-height-retain') | null
> {
  try {
    return await import('@/lib/feed-window-height-retain');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /feed-window-height-retain|Cannot find|Failed to load|does not exist/i.test(
        message
      )
    ) {
      return null;
    }
    throw error;
  }
}

describe('profile and guild feed height retain', () => {
  it('drops heights outside the retained window and keeps the rest', async () => {
    const cache = new FeedWindowSizeCache();
    cache.set('alice.near:kept', 220);
    cache.set('alice.near:other', 140);
    cache.set('alice.near:gone', 180);
    const retain = await loadRetain();
    retain?.retainFeedWindowHeights(cache, [
      { posts: [row('kept')] },
      { posts: [row('other')] },
    ]);
    expect(cache.get('alice.near:gone')).toBeUndefined();
    expect(cache.get('alice.near:kept')).toBe(220);
    expect(cache.get('alice.near:other')).toBe(140);
  });

  it('profile and guild trim call retain at the working-set cut', () => {
    const profile = readFileSync(
      join(here, '../features/home/profile-feed-client.tsx'),
      'utf8'
    );
    const guild = readFileSync(
      join(here, '../features/guilds/live-guild-panel.tsx'),
      'utf8'
    );
    expect(profile).toContain('retainFeedWindowHeights(');
    expect(profile).toContain('profilePostsAfterMemoryTrim(');
    expect(guild).toContain('retainFeedWindowHeights(');
    expect(guild).toContain('rememberGuildFeedHeightSlot(');
  });

  it('bounds guild room height caches and refreshes the hot room', async () => {
    const retain = await loadRetain();
    const max = retain?.GUILD_FEED_HEIGHT_CACHE_MAX ?? 16;
    if (retain?.GUILD_FEED_HEIGHT_CACHE_MAX !== undefined) {
      expect(retain.GUILD_FEED_HEIGHT_CACHE_MAX).toBe(16);
    }
    const slots = new Map<string, GuildFeedHeightSlot>();
    expect(retain).not.toBeNull();
    const remember = retain?.rememberGuildFeedHeightSlot;
    if (!remember) return;
    for (let i = 0; i < max + 1; i += 1) {
      remember(slots, `room-${i}`);
    }
    expect(slots.has('room-0')).toBe(false);
    expect(slots.has(`room-${max}`)).toBe(true);

    const slotsLru = new Map<string, GuildFeedHeightSlot>();
    remember(slotsLru, 'hot');
    for (let i = 0; i < max; i += 1) {
      remember(slotsLru, 'hot');
      remember(slotsLru, `cold-${i}`);
    }
    expect(slotsLru.has('hot')).toBe(true);
    expect(slotsLru.has('cold-0')).toBe(false);
  });
});
