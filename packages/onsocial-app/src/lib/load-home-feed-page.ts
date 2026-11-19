import type { Paginated, PostRow } from '@onsocial/sdk';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';
import { resolveDaoMembershipsForAccounts } from '@/lib/fetch-page-drawer-meta';
import {
  feedAuthorIds,
  FEED_REVEAL_BUDGET_MS,
  quotedSeedFromFeedRows,
  seedDaoMembershipMisses,
  loadFeedPollTallies,
  loadFeedQuotes,
  settleFeedSidePaint,
  type FeedQuoteSeed,
} from '@/lib/prepare-feed-paint';
import type { PollTally } from '@/lib/poll-votes';
import type { ProtocolDaoMemberships } from '@/lib/protocol-dao-memberships';

const HOME_FEED_PAGE_SIZE = 24;

export type HomeFeedPaint = {
  page: Paginated<PostRow>;
  engagement: PostEngagementMap;
  scarceEmbeds: PostScarceEmbedMap;
  quoted: FeedQuoteSeed;
  tallies: Record<string, PollTally>;
  memberships: Record<string, ProtocolDaoMemberships>;
};

/** Public/recent home feed shell + engagement/scarce paint for SSR. */
export async function loadHomeFeedPage(opts?: {
  sort?: HomeFeedSort;
  offset?: number;
  limit?: number;
}): Promise<HomeFeedPaint | null> {
  if (
    process.env.E2E_GRAPH_STUBS === '1' &&
    process.env.E2E_HOME_SSR_MISS === '1'
  ) {
    return null;
  }

  try {
    const os = createServerOnSocialClient();
    const page = await os.query.feed.recent({
      limit: opts?.limit ?? HOME_FEED_PAGE_SIZE,
      offset: opts?.offset ?? 0,
      sort: opts?.sort ?? 'hot',
    });
    const items = page.items ?? [];
    const authorIds = feedAuthorIds(items, {});
    const quotedFromRows = quotedSeedFromFeedRows(items);
    const [engagement, scarceEmbeds, prepared] = await Promise.all([
      loadPostEngagementMap(os, items),
      hydrateScarceEmbedsForPosts(os, items),
      settleFeedSidePaint({
        quotes: quotedFromRows
          ? Promise.resolve(quotedFromRows)
          : loadFeedQuotes(items, os),
        tallies: loadFeedPollTallies(items, os),
        memberships: resolveDaoMembershipsForAccounts(authorIds),
        capMs: FEED_REVEAL_BUDGET_MS,
      }),
    ]);
    return {
      page,
      engagement,
      scarceEmbeds,
      quoted: prepared.quoted,
      tallies: prepared.tallies,
      memberships: seedDaoMembershipMisses(authorIds, prepared.memberships),
    };
  } catch {
    return null;
  }
}
