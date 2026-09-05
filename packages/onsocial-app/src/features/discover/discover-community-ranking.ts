import type { OnSocial } from '@onsocial/sdk';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
  STAKING_GOVERNANCE_DAO_ACCOUNT,
  STAKING_TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import type { DaoCatalogEntry } from '@/features/protocol/dao-catalog-client';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';

/** Protocol / seeded faces we always want at the front of Discover peeks. */
const PRIORITY_DAO_ACCOUNTS = new Set(
  [
    GOVERNANCE_DAO_ACCOUNT,
    TREASURY_DAO_ACCOUNT,
    STAKING_GOVERNANCE_DAO_ACCOUNT,
    STAKING_TREASURY_DAO_ACCOUNT,
  ].map((id) => id.trim().toLowerCase())
);

/** True when the account is clearly OnSocial-hosted (not generic Sputnik). */
export function isOnSocialDaoAccount(accountId: string): boolean {
  const id = accountId.trim().toLowerCase();
  if (!id) return false;
  if (PRIORITY_DAO_ACCOUNTS.has(id)) return true;
  return (
    id.endsWith('.onsocial.near') ||
    id.endsWith('.onsocial.testnet') ||
    id === 'onsocial.near' ||
    id === 'onsocial.testnet'
  );
}

export function daoCatalogRankTier(
  entry: Pick<DaoCatalogEntry, 'daoAccountId' | 'source'>,
  profiledIds?: Set<string>
): number {
  const id = entry.daoAccountId.trim().toLowerCase();
  if (PRIORITY_DAO_ACCOUNTS.has(id)) return 0;
  if ((entry.source ?? '').trim().toLowerCase() === 'seed') return 1;
  if (isOnSocialDaoAccount(id)) return 2;
  if (profiledIds?.has(id)) return 3;
  return 4;
}

/**
 * Stable OnSocial-first ordering for catalog rows.
 * Empty-browse pagination is owned by the governance catalog API (profile
 * promotion included); keep this for peeks / tests / defensive client use.
 */
export function rankDaoCatalogEntries<
  T extends Pick<DaoCatalogEntry, 'daoAccountId' | 'source' | 'listedAt'>,
>(entries: T[], profiledIds?: Set<string>): T[] {
  return [...entries].sort((a, b) => {
    const tier = daoCatalogRankTier(a, profiledIds) - daoCatalogRankTier(b, profiledIds);
    if (tier !== 0) return tier;
    const listed =
      Date.parse(b.listedAt || '') - Date.parse(a.listedAt || '') || 0;
    if (listed !== 0) return listed;
    return a.daoAccountId.localeCompare(b.daoAccountId);
  });
}

export type RankedGuildPeek = {
  groupId: string;
  groupName: string | null;
  memberCount: number;
};

/**
 * Public guilds ranked by index-backed member count (`groups_by_member_count`).
 * Falls back to recent browse + aggregate counts when the view is unavailable.
 */
export async function rankGuildPeeks(
  client: OnSocial,
  opts: { browseLimit?: number; peekLimit?: number } = {}
): Promise<RankedGuildPeek[]> {
  const browseLimit = opts.browseLimit ?? 24;
  const peekLimit = opts.peekLimit ?? 6;

  try {
    const { items } = await client.query.groups.browse({
      publicOnly: true,
      sort: 'members',
      limit: Math.max(browseLimit, peekLimit),
    });
    if (items.length > 0) {
      return items.slice(0, peekLimit).map((row) => ({
        groupId: row.groupId,
        groupName: row.groupName,
        memberCount:
          typeof row.memberCount === 'number' && Number.isFinite(row.memberCount)
            ? Math.max(0, Math.floor(row.memberCount))
            : 0,
      }));
    }
  } catch {
    // fall through to recency + aggregate path
  }

  const { items } = await client.query.groups.browse({
    publicOnly: true,
    limit: browseLimit,
  });
  if (items.length === 0) return [];
  const counts = await client.query.groups.memberCountsFor(
    items.map((row) => row.groupId)
  );
  return items
    .map((row) => ({
      groupId: row.groupId,
      groupName: row.groupName,
      memberCount: counts.get(row.groupId) ?? 0,
      blockHeight: row.blockHeight ?? 0,
    }))
    .sort((a, b) => {
      if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
      return (b.blockHeight ?? 0) - (a.blockHeight ?? 0);
    })
    .slice(0, peekLimit)
    .map(({ groupId, groupName, memberCount }) => ({
      groupId,
      groupName,
      memberCount,
    }));
}

export type RankedHubPeek = {
  appId: string;
  title: string | null;
  bannerUrl: string | null;
  markUrl: string | null;
};

type HubStatsRow = {
  appId: string;
  salesVolume: string | number | null;
  lastActivityTimestamp: number | string | null;
  dropsTotal: number | string | null;
};

async function queryHubStatsTable(
  client: OnSocial,
  table: 'scarcesAppStatsHot' | 'scarcesAppStats',
  limit: number
): Promise<HubStatsRow[]> {
  const res = await client.query.graphql<{
    scarcesAppStatsHot?: HubStatsRow[];
    scarcesAppStats?: HubStatsRow[];
  }>({
    query: `query RankedHubStats($limit: Int!) {
      ${table}(
        limit: $limit
        orderBy: [
          {salesVolume: DESC}
          {lastActivityTimestamp: DESC_NULLS_LAST}
          {dropsTotal: DESC}
        ]
      ) {
        appId
        salesVolume
        lastActivityTimestamp
        dropsTotal
      }
    }`,
    variables: { limit },
  });
  return (
    (table === 'scarcesAppStatsHot'
      ? res.data?.scarcesAppStatsHot
      : res.data?.scarcesAppStats) ?? []
  );
}

/**
 * Hubs with 30d trade volume (`scarces_app_stats_hot`). Empty when that
 * view has no rows — do not fall back to lifetime stats or the directory.
 */
export async function rankHubPeeks(
  client: OnSocial,
  opts: { peekLimit?: number } = {}
): Promise<RankedHubPeek[]> {
  const peekLimit = opts.peekLimit ?? 6;
  const fetchLimit = Math.max(peekLimit * 2, 12);

  let ranks: HubStatsRow[] = [];
  try {
    ranks = await queryHubStatsTable(client, 'scarcesAppStatsHot', fetchLimit);
  } catch {
    return [];
  }

  const ids = ranks
    .map((row) => row.appId?.trim())
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  let peekById = new Map<string, ReturnType<typeof hubPeekFromMetadata>>();
  try {
    const appsRes = await client.query.graphql<{
      scarcesApps: Array<{
        appId: string;
        metadata: string | null;
      }>;
    }>({
      query: `query RankedHubApps($ids: [String!]!, $limit: Int!) {
        scarcesApps(where: { appId: { _in: $ids } }, limit: $limit) {
          appId
          metadata
        }
      }`,
      variables: { ids, limit: ids.length },
    });
    peekById = new Map(
      (appsRes.data?.scarcesApps ?? []).map((row) => [
        row.appId,
        hubPeekFromMetadata(row.metadata, row.appId),
      ])
    );
  } catch {
    peekById = new Map();
  }

  const out: RankedHubPeek[] = [];
  for (const id of ids) {
    const peek = peekById.get(id) ?? hubPeekFromMetadata(null, id);
    out.push({
      appId: id,
      title: peek.title,
      bannerUrl: peek.bannerUrl,
      markUrl: peek.markUrl,
    });
    if (out.length >= peekLimit) break;
  }
  return out;
}

/** Hub name + cover from app metadata — same fields as the Hubs directory. */
export function hubPeekFromMetadata(
  metadata: string | null | undefined,
  fallbackId: string
): { title: string; bannerUrl: string | null; markUrl: string | null } {
  const fallback = fallbackId.trim() || 'Hub';
  if (!metadata?.trim()) {
    return { title: fallback, bannerUrl: null, markUrl: null };
  }
  try {
    const parsed = JSON.parse(metadata) as {
      title?: unknown;
      name?: unknown;
      image?: unknown;
      media?: unknown;
      banner?: unknown;
    };
    const title =
      (typeof parsed.name === 'string' && parsed.name.trim()) ||
      (typeof parsed.title === 'string' && parsed.title.trim()) ||
      fallback;
    const image =
      (typeof parsed.image === 'string' && parsed.image.trim()) ||
      (typeof parsed.media === 'string' && parsed.media.trim()) ||
      '';
    const banner =
      (typeof parsed.banner === 'string' && parsed.banner.trim()) || '';
    return {
      title,
      markUrl: image ? resolveScarceMediaUrl(image) : null,
      bannerUrl: banner ? resolveScarceMediaUrl(banner) : null,
    };
  } catch {
    return { title: fallback, bannerUrl: null, markUrl: null };
  }
}

/** Mark which DAO accounts have an OnSocial profile row (cheap batch). */
export async function loadProfiledDaoIds(
  client: OnSocial,
  accountIds: string[]
): Promise<Set<string>> {
  const ids = [
    ...new Set(accountIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return new Set();
  try {
    const rows = await client.query.profiles.statsForAccounts(ids);
    return new Set(
      rows.map((row) => row.accountId.trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    return new Set();
  }
}
