import type { Paginated, PostRow } from '@onsocial/sdk';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

const HOME_FEED_PAGE_SIZE = 24;

/** Public/recent home feed shell for SSR first paint (hot by default). */
export async function loadHomeFeedPage(opts?: {
  sort?: HomeFeedSort;
  offset?: number;
  limit?: number;
}): Promise<Paginated<PostRow> | null> {
  try {
    const os = createServerOnSocialClient();
    return await os.query.feed.recent({
      limit: opts?.limit ?? HOME_FEED_PAGE_SIZE,
      offset: opts?.offset ?? 0,
      sort: opts?.sort ?? 'hot',
    });
  } catch {
    return null;
  }
}
