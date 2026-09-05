import type {
  GovernanceEventRow,
  HashtagCount,
  OnSocial,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
import {
  rankHubPeeks,
  type RankedHubPeek,
} from '@/features/discover/discover-community-ranking';
import {
  fetchJustSoldScarcePeeks,
  type DiscoverScarcePeek,
} from '@/features/discover/discover-scarce-peeks';
import { fetchTalkedAboutPosts } from '@/features/discover/discover-talked-about';
import { discoverPageToProfileListAccounts } from '@/lib/discover-profiles';
import {
  countRecentPosters,
  excludeMovingHubsAlreadySold,
  fetchMovingMentionRows,
  movingActivePeeks,
  orderProfileSearchByPosterIds,
  recentPosterIds,
  selectHotPosts,
  type MovingActivePeek,
} from '@/lib/discover-moving';

const SECTION_LIMIT = 6;
const SCAN_POOL = 12;
const HOT_SCAN_POOL = 18;
const ACTIVE_POST_POOL = 48;
const ACTIVE_HYDRATE = 12;

/** One Moving board — every strip, ready to paint together. */
export type MovingBoard = {
  posts: PostRow[];
  talkedAbout: PostRow[];
  justSold: DiscoverScarcePeek[];
  tickers: TickerCount[];
  topics: HashtagCount[];
  places: PlaceCount[];
  profiles: MovingActivePeek[];
  hubs: RankedHubPeek[];
  proposals: GovernanceEventRow[];
  /** Unique posters in the last-window scan. */
  postedCount: number;
  /** True when the scan is full — more people may be moving. */
  postedCapped: boolean;
};

export function emptyMovingBoard(): MovingBoard {
  return {
    posts: [],
    talkedAbout: [],
    justSold: [],
    tickers: [],
    topics: [],
    places: [],
    profiles: [],
    hubs: [],
    proposals: [],
    postedCount: 0,
    postedCapped: false,
  };
}

export function movingBoardFromSeed(
  seed:
    | {
        posts?: PostRow[] | null;
        talkedAbout?: PostRow[] | null;
        justSold?: DiscoverScarcePeek[] | null;
        movingTickers?: TickerCount[] | null;
        movingTopics?: HashtagCount[] | null;
        places?: PlaceCount[] | null;
        profiles?: MovingActivePeek[] | null;
        hubs?: Array<{
          appId: string;
          title: string | null;
          bannerUrl?: string | null;
          markUrl?: string | null;
          lastActivityTimestamp?: number | null;
        }> | null;
        proposals?: GovernanceEventRow[] | null;
        postedCount?: number | null;
        postedCapped?: boolean | null;
      }
    | null
    | undefined
): MovingBoard {
  if (!seed) return emptyMovingBoard();
  const profiles = seed.profiles ?? [];
  return {
    posts: seed.posts ?? [],
    talkedAbout: seed.talkedAbout ?? [],
    justSold: seed.justSold ?? [],
    tickers: seed.movingTickers ?? [],
    topics: seed.movingTopics ?? [],
    places: seed.places ?? [],
    profiles,
    hubs: (seed.hubs ?? []).map((hub) => ({
      appId: hub.appId,
      title: hub.title,
      bannerUrl: hub.bannerUrl ?? null,
      markUrl: hub.markUrl ?? null,
      lastActivityTimestamp: hub.lastActivityTimestamp ?? null,
    })),
    proposals: seed.proposals ?? [],
    postedCount: seed.postedCount ?? profiles.length,
    postedCapped: Boolean(seed.postedCapped),
  };
}

async function loadActiveRoom(os: OnSocial): Promise<{
  profiles: MovingActivePeek[];
  postedCount: number;
  postedCapped: boolean;
}> {
  try {
    const page = await os.query.feed.recent({
      limit: ACTIVE_POST_POOL,
      section: 'posts',
    });
    const postedCount = countRecentPosters(page.items);
    const postedCapped = page.items.length >= ACTIVE_POST_POOL;
    const ids = recentPosterIds(page.items, ACTIVE_HYDRATE);
    if (ids.length === 0) {
      return { profiles: [], postedCount, postedCapped };
    }
    const rows = await os.query.profiles.statsForAccounts(ids);
    const accounts = await discoverPageToProfileListAccounts(os, {
      profiles: orderProfileSearchByPosterIds(rows, ids),
      viewer: null,
    });
    return {
      profiles: movingActivePeeks(accounts, page.items, ACTIVE_HYDRATE),
      postedCount,
      postedCapped,
    };
  } catch {
    return { profiles: [], postedCount: 0, postedCapped: false };
  }
}

async function loadHotPosts(os: OnSocial): Promise<PostRow[]> {
  try {
    const page = await os.query.feed.recent({
      limit: HOT_SCAN_POOL,
      sort: 'hot',
      section: 'posts',
    });
    return selectHotPosts(page.items, SECTION_LIMIT);
  } catch {
    return [];
  }
}

/** Fetch every Moving strip, then slice — caller paints once. */
export async function loadMovingBoard(os: OnSocial): Promise<MovingBoard> {
  const [posts, talkedAbout, justSold, mentions, hubs, proposals, active] =
    await Promise.all([
      loadHotPosts(os),
      fetchTalkedAboutPosts(os, SECTION_LIMIT),
      fetchJustSoldScarcePeeks(os, SECTION_LIMIT),
      fetchMovingMentionRows(os.query, SECTION_LIMIT),
      rankHubPeeks(os, { peekLimit: SCAN_POOL }).catch(
        () => [] as RankedHubPeek[]
      ),
      os.query.governance
        .recentProposals({ limit: SECTION_LIMIT })
        .catch(() => [] as GovernanceEventRow[]),
      loadActiveRoom(os),
    ]);

  return {
    posts,
    talkedAbout,
    justSold,
    tickers: mentions.tickers,
    topics: mentions.topics,
    places: mentions.places,
    profiles: active.profiles,
    hubs: excludeMovingHubsAlreadySold(hubs, justSold).slice(0, SECTION_LIMIT),
    proposals,
    postedCount: active.postedCount,
    postedCapped: active.postedCapped,
  };
}
