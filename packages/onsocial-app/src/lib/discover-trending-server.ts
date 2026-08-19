import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import {
  discoverProfileToProfileListAccount,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { ACTIVE_BACKEND_URL } from '@/lib/app-config';

/** Enough for Topics/Tickers tabs; trending sections slice locally. */
const SECTION_LIMIT = 24;
/** Scarce peeks stay short — titles hydrate via collectionsCurrentByIds. */
const SCARCE_PEEK_LIMIT = 12;

export type DiscoverTrendingGuild = {
  groupId: string;
  groupName: string | null;
};

export type DiscoverTrendingDao = {
  daoAccountId: string;
  name: string | null;
};

/** Network scarce peek row — most traded or most loved. */
export type DiscoverTrendingScarce = {
  collectionId: string;
  title: string | null;
  appId: string | null;
};

export type DiscoverTrendingSeed = {
  tickers: TickerCount[];
  topics: HashtagCount[];
  profiles: ProfileListAccount[];
  guilds: DiscoverTrendingGuild[];
  daos: DiscoverTrendingDao[];
  mostTraded: DiscoverTrendingScarce[];
  mostLoved: DiscoverTrendingScarce[];
};

async function loadTrendingDaos(): Promise<DiscoverTrendingDao[]> {
  try {
    const target = `${ACTIVE_BACKEND_URL.replace(/\/$/, '')}/v1/governance/daos?limit=${SECTION_LIMIT}&offset=0`;
    const res = await fetch(target, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      daos?: Array<{ daoAccountId?: string; name?: string | null }>;
    };
    if (!Array.isArray(body.daos)) return [];
    return body.daos
      .filter((row) => typeof row.daoAccountId === 'string' && row.daoAccountId)
      .map((row) => ({
        daoAccountId: row.daoAccountId as string,
        name: row.name ?? null,
      }));
  } catch {
    return [];
  }
}

async function hydrateScarcePeeks(
  os: ReturnType<typeof createServerOnSocialClient>,
  ids: string[],
  appById: Map<string, string | null>
): Promise<DiscoverTrendingScarce[]> {
  if (ids.length === 0) return [];
  const shells = await os.query.scarces
    .collectionsCurrentByIds(ids)
    .catch(() => []);
  const byId = new Map(
    shells.map((row) => [row.collectionId.trim(), row] as const)
  );
  const out: DiscoverTrendingScarce[] = [];
  for (const id of ids) {
    const shell = byId.get(id);
    if (!shell) continue;
    out.push({
      collectionId: shell.collectionId,
      title: shell.title?.trim() || null,
      appId: shell.appId?.trim() || appById.get(id) || null,
    });
  }
  return out;
}

async function loadMostTraded(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<DiscoverTrendingScarce[]> {
  try {
    const ranks = await os.query.scarces.collectionTradeStats({
      limit: SCARCE_PEEK_LIMIT,
      offset: 0,
    });
    const ids = ranks.map((row) => row.collectionId.trim()).filter(Boolean);
    const appById = new Map(
      ranks.map((row) => [row.collectionId.trim(), row.appId] as const)
    );
    return await hydrateScarcePeeks(os, ids, appById);
  } catch {
    return [];
  }
}

async function loadMostLoved(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<DiscoverTrendingScarce[]> {
  try {
    let ranks: Array<{ collectionId: string }> = [];
    try {
      ranks = await os.query.scarces.collectionLoveFans({
        limit: SCARCE_PEEK_LIMIT,
        offset: 0,
      });
    } catch {
      ranks = await os.query.scarces.albumLoveFans({
        limit: SCARCE_PEEK_LIMIT,
        offset: 0,
      });
    }
    const ids = ranks.map((row) => row.collectionId.trim()).filter(Boolean);
    return await hydrateScarcePeeks(os, ids, new Map());
  } catch {
    return [];
  }
}

/** Cheap trending sections for Discover default tab SSR. */
export async function loadDiscoverTrendingSeed(): Promise<DiscoverTrendingSeed | null> {
  try {
    const os = createServerOnSocialClient();
    const [
      tickers,
      topics,
      profilesPage,
      guildsPage,
      daos,
      mostTraded,
      mostLoved,
    ] = await Promise.all([
      os.query.tickers
        .trending({ limit: SECTION_LIMIT })
        .catch(() => [] as TickerCount[]),
      os.query.hashtags
        .trending({ limit: SECTION_LIMIT })
        .catch(() => [] as HashtagCount[]),
      os.query.profiles
        .discoverPage({ limit: SECTION_LIMIT })
        .then((page) =>
          mapDiscoverPageToResponse(os, page, '', SECTION_LIMIT, 0)
        )
        .catch(() => null),
      os.query.groups
        .browse({ publicOnly: true, limit: SECTION_LIMIT })
        .catch(() => ({
          items: [] as Array<{ groupId: string; groupName: string | null }>,
        })),
      loadTrendingDaos(),
      loadMostTraded(os),
      loadMostLoved(os),
    ]);

    const profiles = (profilesPage?.profiles ?? ([] as DiscoverProfileSummary[]))
      .slice(0, SECTION_LIMIT)
      .map(discoverProfileToProfileListAccount);

    return {
      tickers,
      topics,
      profiles,
      guilds: guildsPage.items.map((g) => ({
        groupId: g.groupId,
        groupName: g.groupName,
      })),
      daos,
      mostTraded,
      mostLoved,
    };
  } catch {
    return null;
  }
}
