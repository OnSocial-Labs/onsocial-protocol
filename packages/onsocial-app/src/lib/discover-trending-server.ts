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
import { discoverPageToProfileListAccounts } from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  orderProfileSearchByPosterIds,
  recentPosterIds,
  selectHotPosts,
} from '@/lib/discover-moving';
import type { ProfileListAccount } from '@/lib/profile-list-account';

/** Enough for Topics/Tickers tabs; movement peeks slice after ranking. */
const TAB_CHIP_LIMIT = 24;
const SECTION_LIMIT = 6;
const ACTIVE_POST_POOL = 24;

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

async function loadHotPosts(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<PostRow[]> {
  try {
    const page = await os.query.feed.recent({
      limit: SECTION_LIMIT,
      sort: 'hot',
      section: 'posts',
    });
    return selectHotPosts(page.items, SECTION_LIMIT);
  } catch {
    return [];
  }
}

async function loadActivePosters(
  os: ReturnType<typeof createServerOnSocialClient>
): Promise<ProfileListAccount[]> {
  try {
    const page = await os.query.feed.recent({
      limit: ACTIVE_POST_POOL,
      section: 'posts',
    });
    const ids = recentPosterIds(page.items, SECTION_LIMIT);
    if (ids.length === 0) return [];
    const rows = await os.query.profiles.statsForAccounts(ids);
    return discoverPageToProfileListAccounts(os, {
      profiles: orderProfileSearchByPosterIds(rows, ids),
      viewer: null,
    });
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
      profiles,
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
      loadActivePosters(os),
      rankHubPeeks(os, { peekLimit: SECTION_LIMIT }),
      loadHotPosts(os),
      fetchMostTradedScarcePeeks(os, SECTION_LIMIT),
      fetchMostLovedScarcePeeks(os, SECTION_LIMIT),
      os.query.governance
        .recentProposals({ limit: SECTION_LIMIT })
        .catch(() => [] as GovernanceEventRow[]),
    ]);

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
