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
export async function fetchIndexedPost(
  ref: {
    author: string;
    postId: string;
  },
  client: OnSocial = createReadOnlyOnSocialClient()
): Promise<PostRow | null> {
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

/** Map key used by fetchIndexedPostsByRefs results. */
export function indexedPostRefKey(author: string, postId: string): string {
  return postRefKey(author, postId);
}

/**
 * Batch-load indexed posts for many (author, postId) pairs in one GraphQL round-trip.
 * Map keys are `${author}\\0${postId}`.
 */
export async function fetchIndexedPostsByRefs(
  refs: Array<{ author: string; postId: string }>,
  client: OnSocial = createReadOnlyOnSocialClient()
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

function groupPostRefKey(
  author: string,
  groupId: string,
  postId: string
): string {
  return `${author}\0${groupId}\0${postId}`;
}

/** Map key used by {@link fetchIndexedGroupPostsByRefs} results. */
export function indexedGroupPostRefKey(
  author: string,
  groupId: string,
  postId: string
): string {
  return groupPostRefKey(author, groupId, postId);
}

/**
 * Batch-load guild posts for many (author, groupId, postId) pairs in one
 * GraphQL round-trip — parity with {@link fetchIndexedPostsByRefs}.
 */
export async function fetchIndexedGroupPostsByRefs(
  refs: Array<{ author: string; groupId: string; postId: string }>,
  client: OnSocial = createReadOnlyOnSocialClient()
): Promise<Map<string, PostRow>> {
  const unique = new Map<
    string,
    { author: string; groupId: string; postId: string }
  >();
  for (const ref of refs) {
    const author = ref.author.trim();
    const groupId = ref.groupId.trim();
    const postId = ref.postId.trim();
    if (!author || !groupId || !postId) continue;
    unique.set(groupPostRefKey(author, groupId, postId), {
      author,
      groupId,
      postId,
    });
  }
  if (unique.size === 0) return new Map();

  const list = [...unique.values()];
  const res = await client.query.graphql<{ postsCurrent: PostRow[] }>({
    query: `query IndexedGroupPostsByRefs($or: [PostsCurrentBoolExp!]!, $limit: Int!) {
      postsCurrent(
        where: {
          isGroupContent: {_eq: true},
          _or: $or
        },
        limit: $limit,
        orderBy: [{blockHeight: DESC}]
      ) {
        ${POST_ROW_SELECTION}
      }
    }`,
    variables: {
      or: list.map((ref) => ({
        accountId: { _eq: ref.author },
        groupId: { _eq: ref.groupId },
        postId: { _eq: ref.postId },
      })),
      limit: list.length,
    },
  });

  const out = new Map<string, PostRow>();
  for (const row of res.data?.postsCurrent ?? []) {
    const groupId = row.groupId?.trim();
    if (!groupId) continue;
    const key = groupPostRefKey(row.accountId, groupId, row.postId);
    if (!out.has(key)) out.set(key, row);
  }
  return out;
}
