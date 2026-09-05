import type {
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
import { rankHubPeeks } from '@/features/discover/discover-community-ranking';
import {
  fetchJustSoldScarcePeeks,
  type DiscoverScarcePeek,
} from '@/features/discover/discover-scarce-peeks';
import { fetchTalkedAboutPosts } from '@/features/discover/discover-talked-about';
import { discoverPageToProfileListAccounts } from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  excludeMovingFacesAlreadyShown,
  excludeMovingHubsAlreadySold,
  fetchMovingMentionRows,
  movingActivePeeks,
  orderProfileSearchByPosterIds,
  recentPosterIds,
  selectHotPosts,
  type MovingActivePeek,
} from '@/lib/discover-moving';

/** Enough for Topics/Tickers tabs; movement peeks slice after ranking. */
const TAB_CHIP_LIMIT = 24;
const SECTION_LIMIT = 6;
const SCAN_POOL = 12;
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
  bannerUrl?: string | null;
  markUrl?: string | null;
};

export type DiscoverTrendingSeed = {
  /** Lifetime count — Topics / Tickers tab first paint. */
  tickers: TickerCount[];
  topics: HashtagCount[];
  /** Last mention — Moving landing chips. */
  movingTickers: TickerCount[];
  movingTopics: HashtagCount[];
  places: PlaceCount[];
  profiles: MovingActivePeek[];
  hubs: DiscoverTrendingHub[];
  posts: PostRow[];
  talkedAbout: PostRow[];
  justSold: DiscoverScarcePeek[];
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
): Promise<MovingActivePeek[]> {
  try {
    const page = await os.query.feed.recent({
      limit: ACTIVE_POST_POOL,
      section: 'posts',
    });
    const ids = recentPosterIds(page.items, SCAN_POOL);
    if (ids.length === 0) return [];
    const rows = await os.query.profiles.statsForAccounts(ids);
    const accounts = await discoverPageToProfileListAccounts(os, {
      profiles: orderProfileSearchByPosterIds(rows, ids),
      viewer: null,
    });
    return movingActivePeeks(accounts, page.items, SCAN_POOL);
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
      mentions,
      profiles,
      hubs,
      posts,
      talkedAbout,
      justSold,
      proposals,
    ] = await Promise.all([
      os.query.tickers
        .trending({ limit: TAB_CHIP_LIMIT })
        .catch(() => [] as TickerCount[]),
      os.query.hashtags
        .trending({ limit: TAB_CHIP_LIMIT })
        .catch(() => [] as HashtagCount[]),
      fetchMovingMentionRows(os.query, SECTION_LIMIT),
      loadActivePosters(os),
      rankHubPeeks(os, { peekLimit: SCAN_POOL }),
      loadHotPosts(os),
      fetchTalkedAboutPosts(os, SECTION_LIMIT),
      fetchJustSoldScarcePeeks(os, SECTION_LIMIT),
      os.query.governance
        .recentProposals({ limit: SECTION_LIMIT })
        .catch(() => [] as GovernanceEventRow[]),
    ]);
    const { tickers: movingTickers, topics: movingTopics, places } = mentions;

    return {
      tickers,
      topics,
      movingTickers,
      movingTopics,
      places,
      profiles: excludeMovingFacesAlreadyShown(
        profiles,
        posts,
        talkedAbout
      ).slice(0, SECTION_LIMIT),
      hubs: excludeMovingHubsAlreadySold(hubs, justSold).slice(
        0,
        SECTION_LIMIT
      ),
      posts,
      talkedAbout,
      justSold,
      proposals,
    };
  } catch {
    return null;
  }
}
