/**
 * In-memory guild shell cache (Standing/Discover style).
 * Per-tab only — name / banner / badge for instant revisit chrome.
 */

export interface GuildShellCacheEntry {
  name: string;
  bannerUrl: string | null;
  badgeUrl: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  description: string;
  topics: string[];
}

/** Soft cap so a long guild-hopping session stays small. */
export const GUILD_SHELL_CACHE_MAX = 50;

const guildShellCache = new Map<string, GuildShellCacheEntry>();

export function guildShellCacheKey(groupId: string): string {
  return groupId.trim();
}

export function readGuildShellCache(
  groupId: string
): GuildShellCacheEntry | undefined {
  const key = guildShellCacheKey(groupId);
  if (!key) return undefined;
  const entry = guildShellCache.get(key);
  if (!entry) return undefined;
  // Refresh LRU order.
  guildShellCache.delete(key);
  guildShellCache.set(key, entry);
  return entry;
}

export function writeGuildShellCache(
  groupId: string,
  entry: GuildShellCacheEntry
): void {
  const key = guildShellCacheKey(groupId);
  if (!key) return;

  if (guildShellCache.has(key)) {
    guildShellCache.delete(key);
  }
  guildShellCache.set(key, entry);

  while (guildShellCache.size > GUILD_SHELL_CACHE_MAX) {
    const oldest = guildShellCache.keys().next().value;
    if (oldest === undefined) break;
    guildShellCache.delete(oldest);
  }
}

export function clearGuildShellCacheForTests(): void {
  guildShellCache.clear();
}
