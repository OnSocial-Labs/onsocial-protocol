/**
 * Account-keyed guild membership hint cache (Standing-style).
 * Per-tab session Map — never store isMember on the public shell cache.
 */

export interface GuildMembershipCacheEntry {
  isMember: boolean;
  joinPending: boolean;
}

/** Soft cap so a long guild-hopping session stays small. */
export const GUILD_MEMBERSHIP_CACHE_MAX = 100;

const guildMembershipCache = new Map<string, GuildMembershipCacheEntry>();

export function guildMembershipCacheKey(
  accountId: string,
  groupId: string
): string {
  return `${accountId.trim()}\n${groupId.trim()}`;
}

export function readGuildMembershipCache(
  accountId: string,
  groupId: string
): GuildMembershipCacheEntry | undefined {
  const key = guildMembershipCacheKey(accountId, groupId);
  if (!accountId.trim() || !groupId.trim()) return undefined;
  const entry = guildMembershipCache.get(key);
  if (!entry) return undefined;
  // Refresh LRU order.
  guildMembershipCache.delete(key);
  guildMembershipCache.set(key, entry);
  return entry;
}

export function writeGuildMembershipCache(
  accountId: string,
  groupId: string,
  entry: GuildMembershipCacheEntry
): void {
  const key = guildMembershipCacheKey(accountId, groupId);
  if (!accountId.trim() || !groupId.trim()) return;

  if (guildMembershipCache.has(key)) {
    guildMembershipCache.delete(key);
  }
  guildMembershipCache.set(key, entry);

  while (guildMembershipCache.size > GUILD_MEMBERSHIP_CACHE_MAX) {
    const oldest = guildMembershipCache.keys().next().value;
    if (oldest === undefined) break;
    guildMembershipCache.delete(oldest);
  }
}

export function clearGuildMembershipCacheForTests(): void {
  guildMembershipCache.clear();
}
