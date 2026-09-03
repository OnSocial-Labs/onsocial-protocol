import type { OnSocial, PostRow } from '@onsocial/sdk';
import {
  movingPostRefKey,
  orderPostsByRefs,
  talkedAboutParentRefs,
  type MovingPostRef,
} from '@/lib/discover-moving';

const DEFAULT_LIMIT = 6;
const REPLY_POOL = 24;

const POST_ROW_SELECTION = `
  accountId postId value blockHeight blockTimestamp receiptId
  parentPath parentAuthor parentType refPath refAuthor refType channel kind audiences
  groupId isGroupContent
`;

async function fetchPostsByRefs(
  client: OnSocial,
  refs: MovingPostRef[]
): Promise<PostRow[]> {
  if (refs.length === 0) return [];
  const res = await client.query.graphql<{ postsCurrent: PostRow[] }>({
    query: `query MovingTalkedAbout($or: [PostsCurrentBoolExp!]!, $limit: Int!) {
      postsCurrent(
        where: { _or: $or },
        limit: $limit,
        orderBy: [{blockHeight: DESC}]
      ) {
        ${POST_ROW_SELECTION}
      }
    }`,
    variables: {
      or: refs.map((ref) => ({
        accountId: { _eq: ref.author },
        postId: { _eq: ref.postId },
      })),
      limit: refs.length,
    },
  });
  const seen = new Set<string>();
  const rows: PostRow[] = [];
  for (const row of res.data?.postsCurrent ?? []) {
    const key = movingPostRefKey({
      author: row.accountId,
      postId: row.postId,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

/** Threads that just received a reply, newest conversation first. */
export async function fetchTalkedAboutPosts(
  client: OnSocial,
  limit = DEFAULT_LIMIT
): Promise<PostRow[]> {
  try {
    const page = await client.query.feed.recent({
      limit: REPLY_POOL,
      section: 'replies',
    });
    const refs = talkedAboutParentRefs(page.items, limit);
    if (refs.length === 0) return [];
    const rows = await fetchPostsByRefs(client, refs);
    return orderPostsByRefs(rows, refs);
  } catch {
    return [];
  }
}
