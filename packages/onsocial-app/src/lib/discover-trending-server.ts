import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import {
  loadProfiledDaoIds,
  rankDaoCatalogEntries,
  rankGuildPeeks,
  rankHubPeeks,
} from '@/features/discover/discover-community-ranking';
import { fetchAppsDirectory } from '@/features/scarces/apps-data';
import {
  discoverProfileToProfileListAccount,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { ACTIVE_BACKEND_URL } from '@/lib/app-config';

/** Enough for Topics/Tickers tabs; community peeks slice after ranking. */
const SECTION_LIMIT = 24;
const COMMUNITY_PEEK_LIMIT = 6;
/** Wider pool so OnSocial / member / activity rank can beat raw recency. */
const COMMUNITY_RANK_POOL = 32;

export type DiscoverTrendingGuild = {
  groupId: string;
  groupName: string | null;
};

export type DiscoverTrendingDao = {
  daoAccountId: string;
  name: string | null;
};

export type DiscoverTrendingHub = {
  appId: string;
  title: string | null;
};

export type DiscoverTrendingSeed = {
  tickers: TickerCount[];
  topics: HashtagCount[];
  profiles: ProfileListAccount[];
  guilds: DiscoverTrendingGuild[];
  daos: DiscoverTrendingDao[];
  hubs: DiscoverTrendingHub[];
};

async function loadTrendingDaos(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<DiscoverTrendingDao[]> {
  try {
    const target = `${ACTIVE_BACKEND_URL.replace(/\/$/, '')}/v1/governance/daos?limit=${COMMUNITY_RANK_POOL}&offset=0`;
    const res = await fetch(target, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      daos?: Array<{
        daoAccountId?: string;
        name?: string | null;
        source?: string | null;
        listedAt?: string | null;
      }>;
    };
    if (!Array.isArray(body.daos)) return [];
    const entries = body.daos
      .filter((row) => typeof row.daoAccountId === 'string' && row.daoAccountId)
      .map((row) => ({
        daoAccountId: row.daoAccountId as string,
        name: row.name ?? null,
        source: row.source ?? 'factory',
        listedAt: row.listedAt ?? '',
      }));
    const profiled = await loadProfiledDaoIds(
      os,
      entries.map((row) => row.daoAccountId)
    );
    return rankDaoCatalogEntries(entries, profiled)
      .slice(0, COMMUNITY_PEEK_LIMIT)
      .map((row) => ({
        daoAccountId: row.daoAccountId,
        name: row.name,
      }));
  } catch {
    return [];
  }
}

async function loadTrendingGuilds(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<DiscoverTrendingGuild[]> {
  try {
    const ranked = await rankGuildPeeks(os, {
      browseLimit: COMMUNITY_RANK_POOL,
      peekLimit: COMMUNITY_PEEK_LIMIT,
    });
    return ranked.map((row) => ({
      groupId: row.groupId,
      groupName: row.groupName,
    }));
  } catch {
    return [];
  }
}

async function loadTrendingHubs(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<DiscoverTrendingHub[]> {
  return rankHubPeeks(os, {
    peekLimit: COMMUNITY_PEEK_LIMIT,
    fetchRecentFallback: async () => {
      const page = await fetchAppsDirectory({
        limit: COMMUNITY_RANK_POOL,
        hideTest: true,
        sort: 'recent',
      });
      return page.apps.map((app) => ({
        appId: app.appId,
        title: app.title?.trim() || null,
      }));
    },
  });
}

/** Cheap trending sections for Discover default tab SSR. */
export async function loadDiscoverTrendingSeed(): Promise<DiscoverTrendingSeed | null> {
  try {
    const os = createServerOnSocialClient();
    const [tickers, topics, profilesPage, daos, guilds, hubs] =
      await Promise.all([
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
        loadTrendingDaos(os),
        loadTrendingGuilds(os),
        loadTrendingHubs(os),
      ]);

    const profiles = (profilesPage?.profiles ?? ([] as DiscoverProfileSummary[]))
      .slice(0, SECTION_LIMIT)
      .map(discoverProfileToProfileListAccount);

    return {
      tickers,
      topics,
      profiles,
      guilds,
      daos,
      hubs,
    };
  } catch {
    return null;
  }
}
