import type { OnSocial, PostRow } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const POST_ROW_SELECTION = `
  accountId postId value blockHeight blockTimestamp receiptId
  parentPath parentAuthor parentType refPath refAuthor refType channel kind audiences
  groupId isGroupContent
`;

/** Indexed personal post by author + id (`isGroupContent: false`). */
export async function fetchPersonalPost(
  ref: {
    author: string;
    postId: string;
  },
  /** Inject `createServerOnSocialClient()` on SSR; browser default is OnAPI proxy. */
  client: OnSocial = createReadOnlyOnSocialClient()
): Promise<PostRow | null> {
  const res = await client.query.graphql<{ postsCurrent: PostRow[] }>({
    query: `query PersonalPost($accountId: String!, $postId: String!) {
      postsCurrent(
        where: {
          accountId: {_eq: $accountId},
          postId: {_eq: $postId},
          isGroupContent: {_eq: false}
        },
        limit: 1,
        orderBy: [{blockHeight: DESC}]
      ) {
        ${POST_ROW_SELECTION}
      }
    }`,
    variables: {
      accountId: ref.author,
      postId: ref.postId,
    },
  });
  return res.data?.postsCurrent?.[0] ?? null;
}

/** Indexed post by author + id — personal or guild. */
export async function fetchIndexedPost(ref: {
  author: string;
  postId: string;
}): Promise<PostRow | null> {
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{ postsCurrent: PostRow[] }>({
    query: `query IndexedPost($accountId: String!, $postId: String!) {
      postsCurrent(
        where: {
          accountId: {_eq: $accountId},
          postId: {_eq: $postId}
        },
        limit: 1,
        orderBy: [{blockHeight: DESC}]
      ) {
        ${POST_ROW_SELECTION}
      }
    }`,
    variables: {
      accountId: ref.author,
      postId: ref.postId,
    },
  });
  return res.data?.postsCurrent?.[0] ?? null;
}

function postRefKey(author: string, postId: string): string {
  return `${author}\0${postId}`;
}

/**
 * Batch-load indexed posts for many (author, postId) pairs in one GraphQL round-trip.
 * Map keys are `${author}\\0${postId}`.
 */
export async function fetchIndexedPostsByRefs(
  refs: Array<{ author: string; postId: string }>
): Promise<Map<string, PostRow>> {
  const unique = new Map<string, { author: string; postId: string }>();
  for (const ref of refs) {
    const author = ref.author.trim();
    const postId = ref.postId.trim();
    if (!author || !postId) continue;
    unique.set(postRefKey(author, postId), { author, postId });
  }
  if (unique.size === 0) return new Map();

  const list = [...unique.values()];
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{ postsCurrent: PostRow[] }>({
    query: `query IndexedPostsByRefs($or: [PostsCurrentBoolExp!]!, $limit: Int!) {
      postsCurrent(
        where: { _or: $or },
        limit: $limit,
        orderBy: [{blockHeight: DESC}]
      ) {
        ${POST_ROW_SELECTION}
      }
    }`,
    variables: {
      or: list.map((ref) => ({
        accountId: { _eq: ref.author },
        postId: { _eq: ref.postId },
      })),
      limit: list.length,
    },
  });

  const out = new Map<string, PostRow>();
  for (const row of res.data?.postsCurrent ?? []) {
    const key = postRefKey(row.accountId, row.postId);
    if (!out.has(key)) out.set(key, row);
  }
  return out;
}
