import type { PostRow } from '@onsocial/sdk';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import {
  assignStableFeedBlockKeys,
  coalesceFeedThreads,
  type CoalesceFeedThreadsOptions,
  type FeedBlockKeyState,
} from '@/lib/feed-threads';

/**
 * One measured-height cache per guild room the panel has scrolled. Retain
 * trims each cache to that room's working set. 16 covers back-and-forth
 * across a few guilds' rooms; older rooms remeasure.
 */
export const GUILD_FEED_HEIGHT_CACHE_MAX = 16;

export type GuildFeedHeightSlot = {
  cache: FeedWindowSizeCache;
  blockKeys: FeedBlockKeyState[];
};

export function guildFeedHeightSlotKey(
  groupId: string,
  filterId: string
): string {
  return `${groupId}\0${filterId}`;
}

/** LRU slot for one guild room. The cache itself is trimmed by retain. */
export function rememberGuildFeedHeightSlot(
  slots: Map<string, GuildFeedHeightSlot>,
  key: string
): GuildFeedHeightSlot {
  const existing = slots.get(key);
  if (existing) {
    slots.delete(key);
    slots.set(key, existing);
    return existing;
  }
  const created: GuildFeedHeightSlot = {
    cache: new FeedWindowSizeCache(),
    blockKeys: [],
  };
  slots.set(key, created);
  while (slots.size > GUILD_FEED_HEIGHT_CACHE_MAX) {
    const oldest = slots.keys().next().value;
    if (oldest === undefined) break;
    slots.delete(oldest);
  }
  return created;
}

export type FeedHeightRetainPart = {
  posts: readonly PostRow[];
  previous?: readonly FeedBlockKeyState[];
  options?: CoalesceFeedThreadsOptions;
};

/**
 * Home's `sizeCache.retain` for a working-set cut. Each part is one list
 * (a guild room, or one profile text section). Keys outside that union drop.
 * Kept rows keep the measured height the spacer will ask for.
 */
export function retainFeedWindowHeights(
  cache: FeedWindowSizeCache,
  parts: readonly FeedHeightRetainPart[]
): FeedBlockKeyState[][] {
  const states: FeedBlockKeyState[][] = [];
  const keys: string[] = [];
  for (const part of parts) {
    const assigned = assignStableFeedBlockKeys(
      coalesceFeedThreads([...part.posts], part.options),
      part.previous ?? []
    );
    states.push(assigned.state);
    for (const key of assigned.keys) keys.push(key);
  }
  cache.retain(keys);
  return states;
}
