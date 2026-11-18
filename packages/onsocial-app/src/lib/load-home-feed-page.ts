import type { Paginated, PostRow } from '@onsocial/sdk';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { resolveDaoMembershipsForAccounts } from '@/lib/fetch-page-drawer-meta';
import {
  feedAuthorIds,
  FEED_SIDE_PAINT_CAP_MS,
  loadFeedPollTallies,
  loadFeedQuotes,
  sequenceFeedQuoteThenTally,
  settleFeedSidePaint,
  type FeedQuoteSeed,
} from '@/lib/prepare-feed-paint';
import type { PollTally } from '@/lib/poll-votes';
import type { ProtocolDaoMemberships } from '@/lib/protocol-dao-memberships';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';

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
    const [engagement, scarceEmbeds, prepared] = await Promise.all([
      loadPostEngagementMap(os, items),
      hydrateScarceEmbedsForPosts(os, items),
      settleFeedSidePaint({
        ...sequenceFeedQuoteThenTally(loadFeedQuotes(items, os), () =>
          loadFeedPollTallies(items, os)
        ),
        memberships: resolveDaoMembershipsForAccounts(
          feedAuthorIds(items, {})
        ),
        capMs: FEED_SIDE_PAINT_CAP_MS,
      }),
    ]);
    return {
      page,
      engagement,
      scarceEmbeds,
      quoted: prepared.quoted,
      tallies: prepared.tallies,
      memberships: prepared.memberships,
    };
  } catch {
    return null;
  }
}
