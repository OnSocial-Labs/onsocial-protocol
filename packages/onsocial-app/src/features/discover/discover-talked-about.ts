import type { OnSocial, PostRow } from '@onsocial/sdk';
import { talkedAboutReplies } from '@/lib/discover-moving';

const DEFAULT_LIMIT = 6;
const REPLY_POOL = 24;

/** Replies that just landed — one per parent, newest conversation first. */
export async function fetchTalkedAboutPosts(
  client: OnSocial,
  limit = DEFAULT_LIMIT
): Promise<PostRow[]> {
  try {
    const page = await client.query.feed.recent({
      limit: REPLY_POOL,
      section: 'replies',
    });
    return talkedAboutReplies(page.items, limit);
  } catch {
    return [];
  }
}
