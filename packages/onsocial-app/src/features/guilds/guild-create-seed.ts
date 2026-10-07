import type { GuildConfigSnapshot } from '@/features/guilds/guild-config';
import {
  cloneGuildStructure,
  DEFAULT_GUILD_STRUCTURE,
} from '@/features/guilds/guild-structure';
import { guildMediaUrlFromCid } from '@/features/guilds/guild-visual';
import { writeGuildMembershipCache } from '@/lib/guild-membership-cache';
import { writeGuildPageCache } from '@/lib/guild-page-cache';
import {
  writeGuildShellCache,
  type GuildShellCacheEntry,
} from '@/lib/guild-shell-cache';

/**
 * Confirmed-ledger seed for a freshly created guild. The indexer lags the
 * create tx, so paint the new page from what the creator just wrote instead
 * of falling back to a cold skeleton.
 */
export function seedCreatedGuildCaches(input: {
  groupId: string;
  accountId: string;
  name: string;
  description: string;
  bannerCid?: string | null;
  badgeCid?: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  topics: string[];
}): void {
  const shell: GuildShellCacheEntry = {
    name: input.name,
    bannerUrl: guildMediaUrlFromCid(input.bannerCid),
    badgeUrl: guildMediaUrlFromCid(input.badgeCid),
    accessGated: input.accessGated,
    memberDriven: input.memberDriven,
    description: input.description,
    topics: input.topics,
  };
  const config: GuildConfigSnapshot = {
    ...shell,
    ownerId: input.accountId,
    structure: cloneGuildStructure(DEFAULT_GUILD_STRUCTURE),
  };
  writeGuildShellCache(input.groupId, shell);
  writeGuildPageCache(input.groupId, {
    config,
    shell,
    stats: null,
    indexedMemberCount: null,
    members: [],
    postCount: 0,
    structureResolved: true,
  });
  writeGuildMembershipCache(input.accountId, input.groupId, {
    isMember: true,
    joinPending: false,
  });
}
