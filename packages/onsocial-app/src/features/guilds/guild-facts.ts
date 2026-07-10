import type { GroupStats } from '@onsocial/sdk';
import {
  deriveGuildAccessGated,
  normalizeGuildTagList,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import {
  guildModeLabel,
  guildRoleFromFlags,
} from '@/features/guilds/guild-card-display';
import { guildMediaUrlFromCid } from '@/features/guilds/guild-visual';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';

/** Chain stats expose `total_members`; older typings used `member_count`. */
export function readGroupStatsMemberCount(
  stats: GroupStats | Record<string, unknown> | null | undefined
): number | null {
  if (!stats || typeof stats !== 'object') return null;

  const raw =
    (stats as Record<string, unknown>).total_members ??
    (stats as GroupStats).member_count ??
    (stats as Record<string, unknown>).members;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
  }
  return null;
}

/** Prefer on-chain stats; never show a count lower than a confirmed roster floor. */
export function resolveGuildMemberCount(input: {
  chainStats?: GroupStats | Record<string, unknown> | null;
  indexedCount?: number | null;
  rosterFloor?: number;
}): number | null {
  const chain = readGroupStatsMemberCount(input.chainStats ?? null);
  const indexed =
    typeof input.indexedCount === 'number' && Number.isFinite(input.indexedCount)
      ? Math.max(0, Math.floor(input.indexedCount))
      : null;
  const floor =
    typeof input.rosterFloor === 'number' && Number.isFinite(input.rosterFloor)
      ? Math.max(0, Math.floor(input.rosterFloor))
      : 0;

  if (chain === null && indexed === null) {
    return floor > 0 ? floor : null;
  }

  return Math.max(chain ?? 0, indexed ?? 0, floor);
}

export function guildAccessLabel(
  accessGated: boolean,
  memberDriven = false
): string {
  return guildModeLabel({ accessGated, memberDriven });
}

function membershipRowToCardBase(row: {
  groupId: string;
  groupName?: string | null;
  groupDescription?: string | null;
  groupAvatarCid?: string | null;
  groupBannerCid?: string | null;
  isPublic?: boolean | null;
  isMemberDriven?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  canModerate?: boolean;
}): GuildSummaryCardModel {
  return {
    groupId: row.groupId,
    name: row.groupName ?? null,
    description: row.groupDescription ?? null,
    avatarUrl: guildMediaUrlFromCid(row.groupAvatarCid),
    bannerUrl: guildMediaUrlFromCid(row.groupBannerCid),
    accessGated: deriveGuildAccessGated({ isPublic: row.isPublic }),
    memberDriven: Boolean(row.isMemberDriven),
    memberCount: null,
    tags: [],
    role: guildRoleFromFlags(row),
  };
}

export function guildSummaryCardFromMembership(row: Parameters<
  typeof membershipRowToCardBase
>[0]): GuildSummaryCardModel {
  return membershipRowToCardBase(row);
}

export function guildSummaryCardFromBrowse(row: {
  groupId: string;
  groupName?: string | null;
  groupDescription?: string | null;
  groupAvatarCid?: string | null;
  groupBannerCid?: string | null;
  isPublic?: boolean | null;
  isMemberDriven?: boolean;
}): GuildSummaryCardModel {
  return {
    ...membershipRowToCardBase(row),
    role: null,
  };
}

export function applyChainGuildFacts(
  card: GuildSummaryCardModel,
  input: {
    config?: Record<string, unknown> | GuildConfigSnapshot | null;
    stats?: GroupStats | Record<string, unknown> | null;
    indexedMemberCount?: number | null;
  }
): GuildSummaryCardModel {
  const accessGated = input.config
    ? 'accessGated' in input.config &&
      typeof input.config.accessGated === 'boolean'
      ? input.config.accessGated
      : deriveGuildAccessGated(
          input.config as Record<string, unknown>
        )
    : card.accessGated;

  const memberCount = resolveGuildMemberCount({
    chainStats: input.stats,
    indexedCount: input.indexedMemberCount ?? card.memberCount,
  });

  const tags = input.config
    ? normalizeGuildTagList((input.config as { tags?: unknown }).tags)
    : (card.tags ?? []);

  return {
    ...card,
    accessGated,
    memberCount,
    tags,
  };
}

export async function enrichGuildSummaryCards<
  TClient extends {
    groups: {
      getStats: (groupId: string) => Promise<GroupStats | null>;
      getConfig: (groupId: string) => Promise<Record<string, unknown> | null>;
    };
    query: {
      groups: {
        memberCountsFor: (groupIds: string[]) => Promise<Map<string, number>>;
      };
    };
  },
>(client: TClient, cards: GuildSummaryCardModel[]): Promise<GuildSummaryCardModel[]> {
  if (cards.length === 0) return cards;

  let indexedCounts = new Map<string, number>();
  try {
    indexedCounts = await client.query.groups.memberCountsFor(
      cards.map((card) => card.groupId)
    );
  } catch {
    // Chain reads below remain authoritative for member count.
  }

  const chunkSize = 6;
  const enriched: GuildSummaryCardModel[] = [];

  for (let offset = 0; offset < cards.length; offset += chunkSize) {
    const chunk = cards.slice(offset, offset + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (card) => {
        try {
          const [stats, config] = await Promise.all([
            client.groups.getStats(card.groupId),
            client.groups.getConfig(card.groupId),
          ]);
          return applyChainGuildFacts(card, {
            stats,
            config,
            indexedMemberCount: indexedCounts.get(card.groupId) ?? null,
          });
        } catch {
          const memberCount = resolveGuildMemberCount({
            indexedCount: indexedCounts.get(card.groupId) ?? null,
          });
          return memberCount === null ? card : { ...card, memberCount };
        }
      })
    );
    enriched.push(...chunkResults);
  }

  return enriched;
}
