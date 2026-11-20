/**
 * Room titles keyed by guild + channel. Guild feeds fill this when structure
 * is known; pointerdown / open warms the rest so the chip keeps one line seat
 * and usually paints the real title on first frame.
 */

import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  guildSpaceFeedChannel,
  parseGuildStructure,
} from '@/features/guilds/guild-structure';

const titleCache = new Map<string, string>();
const warmInflight = new Map<string, Promise<void>>();

function cacheKey(groupId: string, channel: string): string {
  return `${groupId.trim()}\0${channel.trim()}`;
}

/** Store room titles for a guild (from structure / All feed). */
export function seedGuildChannelTitles(
  groupId: string,
  titles: Record<string, string>
): void {
  const guild = groupId.trim();
  if (!guild) return;
  for (const [channel, title] of Object.entries(titles)) {
    const id = channel.trim();
    const label = title.trim();
    if (!id || !label) continue;
    titleCache.set(cacheKey(guild, id), label);
  }
}

/** Title already known for this guild room — no fetch. */
export function peekGuildChannelTitle(
  groupId: string,
  channel: string
): string | undefined {
  const guild = groupId.trim();
  const id = channel.trim();
  if (!guild || !id) return undefined;
  return titleCache.get(cacheKey(guild, id));
}

/** All cached titles for a guild — merge under live structure maps. */
export function guildChannelTitlesForGroup(
  groupId: string
): Record<string, string> {
  const guild = groupId.trim();
  if (!guild) return {};
  const prefix = `${guild}\0`;
  const out: Record<string, string> = {};
  for (const [key, title] of titleCache) {
    if (!key.startsWith(prefix)) continue;
    out[key.slice(prefix.length)] = title;
  }
  return out;
}

/**
 * Prefetch room titles for a guild (pointerdown / open). Skips when the
 * cache already has rooms for that guild.
 */
export function warmGuildChannelTitles(groupId: string): void {
  const guild = groupId.trim();
  if (!guild) return;
  if (Object.keys(guildChannelTitlesForGroup(guild)).length > 0) return;
  if (warmInflight.has(guild)) return;
  const request = (async () => {
    try {
      const raw = await createReadOnlyOnSocialClient().groups.getConfig(guild);
      if (!raw) return;
      const structure = parseGuildStructure(raw);
      const titles: Record<string, string> = {};
      for (const space of structure.spaces) {
        titles[space.id] = space.title;
        titles[guildSpaceFeedChannel(space)] = space.title;
      }
      seedGuildChannelTitles(guild, titles);
    } catch {
      // Panel load still fills titles; the channel seat stays reserved.
    } finally {
      warmInflight.delete(guild);
    }
  })();
  warmInflight.set(guild, request);
}

/** Test helper — drop every cached room title. */
export function clearGuildChannelTitles(): void {
  titleCache.clear();
  warmInflight.clear();
}
