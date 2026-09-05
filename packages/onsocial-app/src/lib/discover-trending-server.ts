import type {
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
import { loadMovingBoard } from '@/lib/discover-moving-board';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import type { MovingActivePeek } from '@/lib/discover-moving';
import type { DiscoverScarcePeek } from '@/features/discover/discover-scarce-peeks';

/** Enough for Topics/Tickers tabs; movement peeks slice after ranking. */
const TAB_CHIP_LIMIT = 24;

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
  lastActivityTimestamp?: number | null;
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
  postedCount: number;
  postedCapped: boolean;
};

/** Movement sections for Discover default tab SSR — one board. */
export async function loadDiscoverTrendingSeed(): Promise<DiscoverTrendingSeed | null> {
  try {
    const os = createServerOnSocialClient();
    const [tickers, topics, board] = await Promise.all([
      os.query.tickers
        .trending({ limit: TAB_CHIP_LIMIT })
        .catch(() => [] as TickerCount[]),
      os.query.hashtags
        .trending({ limit: TAB_CHIP_LIMIT })
        .catch(() => [] as HashtagCount[]),
      loadMovingBoard(os),
    ]);

    return {
      tickers,
      topics,
      movingTickers: board.tickers,
      movingTopics: board.topics,
      places: board.places,
      profiles: board.profiles,
      hubs: board.hubs,
      posts: board.posts,
      talkedAbout: board.talkedAbout,
      justSold: board.justSold,
      proposals: board.proposals,
      postedCount: board.postedCount,
      postedCapped: board.postedCapped,
    };
  } catch {
    return null;
  }
}
