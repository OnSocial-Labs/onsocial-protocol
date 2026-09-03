import type {
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
import { rankHubPeeks } from '@/features/discover/discover-community-ranking';
import {
  fetchMostLovedScarcePeeks,
  fetchMostTradedScarcePeeks,
  type DiscoverScarcePeek,
} from '@/features/discover/discover-scarce-peeks';
import { fetchAppsDirectory } from '@/features/scarces/apps-data';
import {
  discoverProfileToProfileListAccount,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';
import type { ProfileListAccount } from '@/lib/profile-list-account';

/** Enough for Topics/Tickers tabs; movement peeks slice after ranking. */
const TAB_CHIP_LIMIT = 24;
const SECTION_LIMIT = 6;
/** Wider pool when falling back to recent hubs. */
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
  /** Lifetime count — Topics / Tickers tab first paint. */
  tickers: TickerCount[];
  topics: HashtagCount[];
  /** Last mention — Moving landing chips. */
  movingTickers: TickerCount[];
  movingTopics: HashtagCount[];
  places: PlaceCount[];
  profiles: ProfileListAccount[];
  hubs: DiscoverTrendingHub[];
  posts: PostRow[];
  dropsTraded: DiscoverScarcePeek[];
  dropsLoved: DiscoverScarcePeek[];
  proposals: GovernanceEventRow[];
};

async function loadMovingHubs(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<DiscoverTrendingHub[]> {
  return rankHubPeeks(os, {
    peekLimit: SECTION_LIMIT,
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

async function loadHotPosts(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<PostRow[]> {
  try {
    const page = await os.query.feed.recent({
      limit: SECTION_LIMIT,
      sort: 'hot',
      section: 'posts',
    });
    return page.items;
  } catch {
    return [];
  }
}

/** Movement sections for Discover default tab SSR. */
export async function loadDiscoverTrendingSeed(): Promise<DiscoverTrendingSeed | null> {
  try {
    const os = createServerOnSocialClient();
    const [
      tickers,
      topics,
      movingTickers,
      movingTopics,
      places,
      profilesPage,
      hubs,
      posts,
      dropsTraded,
      dropsLoved,
      proposals,
    ] = await Promise.all([
      os.query.tickers
        .trending({ limit: TAB_CHIP_LIMIT })
        .catch(() => [] as TickerCount[]),
      os.query.hashtags
        .trending({ limit: TAB_CHIP_LIMIT })
        .catch(() => [] as HashtagCount[]),
      os.query.tickers
        .trending({ limit: SECTION_LIMIT, sort: 'recent' })
        .catch(() => [] as TickerCount[]),
      os.query.hashtags
        .trending({ limit: SECTION_LIMIT, sort: 'recent' })
        .catch(() => [] as HashtagCount[]),
      os.query.places
        .trending({ limit: SECTION_LIMIT, sort: 'recent' })
        .catch(() => [] as PlaceCount[]),
      os.query.profiles
        .discoverPage({ limit: SECTION_LIMIT, order: 'activity' })
        .then((page) =>
          mapDiscoverPageToResponse(os, page, '', SECTION_LIMIT, 0)
        )
        .catch(() => null),
      loadMovingHubs(os),
      loadHotPosts(os),
      fetchMostTradedScarcePeeks(os, SECTION_LIMIT),
      fetchMostLovedScarcePeeks(os, SECTION_LIMIT),
      os.query.governance
        .recentProposals({ limit: SECTION_LIMIT })
        .catch(() => [] as GovernanceEventRow[]),
    ]);

    const profiles = (profilesPage?.profiles ?? ([] as DiscoverProfileSummary[]))
      .slice(0, SECTION_LIMIT)
      .map(discoverProfileToProfileListAccount);

    return {
      tickers,
      topics,
      movingTickers,
      movingTopics,
      places,
      profiles,
      hubs,
      posts,
      dropsTraded,
      dropsLoved,
      proposals,
    };
  } catch {
    return null;
  }
}
