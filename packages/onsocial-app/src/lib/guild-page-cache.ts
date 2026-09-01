/**
 * In-memory guild page + per-room feed cache (same tab).
 * Lets client guild hops and room flips paint instantly instead of blanking.
 */

import type { GroupMemberRow, GroupStats, PostRow } from '@onsocial/sdk';
import type { GuildConfigSnapshot } from '@/features/guilds/guild-config';
import type { GuildSpace } from '@/features/guilds/guild-structure';
import { guildSpaceMatchesPostChannel } from '@/features/guilds/guild-structure';
import type { GuildShellCacheEntry } from '@/lib/guild-shell-cache';

export interface GuildPageCacheEntry {
  config: GuildConfigSnapshot;
  shell: GuildShellCacheEntry;
  stats: GroupStats | null;
  indexedMemberCount: number | null;
  members: GroupMemberRow[];
  postCount: number | null;
  structureResolved: boolean;
}

export interface GuildFeedCacheEntry {
  posts: PostRow[];
  hasMore: boolean;
}

/** Soft cap so a long guild-hopping session stays small. */
export const GUILD_PAGE_CACHE_MAX = 50;
export const GUILD_FEED_CACHE_MAX = 80;

const pageCache = new Map<string, GuildPageCacheEntry>();
const feedCache = new Map<string, GuildFeedCacheEntry>();

export function guildPageCacheKey(groupId: string): string {
  return groupId.trim();
}

export function guildFeedCacheKey(
  groupId: string,
  filterId: string = 'all'
): string {
  const id = groupId.trim();
  const filter = filterId.trim() || 'all';
  return id ? `${id}::${filter}` : '';
}

function touchMap<T>(map: Map<string, T>, key: string, entry: T, max: number) {
  if (map.has(key)) map.delete(key);
  map.set(key, entry);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function readGuildPageCache(
  groupId: string
): GuildPageCacheEntry | undefined {
  const key = guildPageCacheKey(groupId);
  if (!key) return undefined;
  const entry = pageCache.get(key);
  if (!entry) return undefined;
  pageCache.delete(key);
  pageCache.set(key, entry);
  return entry;
}

export function writeGuildPageCache(
  groupId: string,
  entry: GuildPageCacheEntry
): void {
  const key = guildPageCacheKey(groupId);
  if (!key) return;
  touchMap(pageCache, key, entry, GUILD_PAGE_CACHE_MAX);
}

export function readGuildFeedCache(
  groupId: string,
  filterId: string = 'all'
): GuildFeedCacheEntry | undefined {
  const key = guildFeedCacheKey(groupId, filterId);
  if (!key) return undefined;
  const entry = feedCache.get(key);
  if (!entry) return undefined;
  feedCache.delete(key);
  feedCache.set(key, entry);
  return entry;
}

export function writeGuildFeedCache(
  groupId: string,
  filterId: string,
  entry: GuildFeedCacheEntry
): void {
  const key = guildFeedCacheKey(groupId, filterId);
  if (!key) return;
  touchMap(feedCache, key, entry, GUILD_FEED_CACHE_MAX);
}

export function clearGuildPageCacheForTests(): void {
  pageCache.clear();
  feedCache.clear();
}

/** Instant room paint from the already-fetched "all" feed while the indexer query runs. */
export function filterGuildPostsForSpace(
  posts: readonly PostRow[],
  space: GuildSpace | null
): PostRow[] {
  if (!space) return [...posts];
  return posts.filter((post) =>
    guildSpaceMatchesPostChannel(space, post.channel)
  );
}
