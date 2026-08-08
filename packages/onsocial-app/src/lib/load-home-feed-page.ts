import type { Paginated, PostRow } from '@onsocial/sdk';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
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
};

/** Public/recent home feed shell + engagement/scarce paint for SSR. */
export async function loadHomeFeedPage(opts?: {
  sort?: HomeFeedSort;
  offset?: number;
  limit?: number;
}): Promise<HomeFeedPaint | null> {
  try {
    const os = createServerOnSocialClient();
    const page = await os.query.feed.recent({
      limit: opts?.limit ?? HOME_FEED_PAGE_SIZE,
      offset: opts?.offset ?? 0,
      sort: opts?.sort ?? 'hot',
    });
    const items = page.items ?? [];
    const [engagement, scarceEmbeds] = await Promise.all([
      loadPostEngagementMap(os, items),
      hydrateScarceEmbedsForPosts(os, items),
    ]);
    return { page, engagement, scarceEmbeds };
  } catch {
    return null;
  }
}
