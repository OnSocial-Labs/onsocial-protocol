import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import {
  discoverProfileToProfileListAccount,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';
import type { ProfileListAccount } from '@/lib/profile-list-account';

const SECTION_LIMIT = 6;

export type DiscoverTrendingGuild = {
  groupId: string;
  groupName: string | null;
};

export type DiscoverTrendingSeed = {
  tickers: TickerCount[];
  topics: HashtagCount[];
  profiles: ProfileListAccount[];
  guilds: DiscoverTrendingGuild[];
};

/** Cheap trending sections for Discover default tab SSR. */
export async function loadDiscoverTrendingSeed(): Promise<DiscoverTrendingSeed | null> {
  try {
    const os = createServerOnSocialClient();
    const [tickers, topics, profilesPage, guildsPage] = await Promise.all([
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
    };
  } catch {
    return null;
  }
}
