import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import {
  discoverProfileToProfileListAccount,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { ACTIVE_BACKEND_URL } from '@/lib/app-config';
import { fetchAppsDirectory } from '@/features/scarces/apps-data';

/** Enough for Topics/Tickers tabs; trending sections slice locally. */
const SECTION_LIMIT = 24;

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

async function loadTrendingHubs(): Promise<DiscoverTrendingHub[]> {
  try {
    const page = await fetchAppsDirectory({
      limit: SECTION_LIMIT,
      hideTest: true,
      sort: 'recent',
    });
    return page.apps.map((app) => ({
      appId: app.appId,
      title: app.title?.trim() || null,
    }));
  } catch {
    return [];
  }
}

/** Cheap trending sections for Discover default tab SSR. */
export async function loadDiscoverTrendingSeed(): Promise<DiscoverTrendingSeed | null> {
  try {
    const os = createServerOnSocialClient();
    const [tickers, topics, profilesPage, guildsPage, daos, hubs] =
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
        os.query.groups
          .browse({ publicOnly: true, limit: SECTION_LIMIT })
          .catch(() => ({
            items: [] as Array<{ groupId: string; groupName: string | null }>,
          })),
        loadTrendingDaos(),
        loadTrendingHubs(),
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
      hubs,
    };
  } catch {
    return null;
  }
}
