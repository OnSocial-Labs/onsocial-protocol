import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';

const DEFAULT_LIKE_KIND = 'like';
const DEFAULT_LIMIT = 80;
/** Cap settled warm reads so feed scroll does not retain every post forever. */
const SETTLED_MAX = 48;

const inflight = new Map<string, Promise<string[]>>();
const settled = new Map<string, string[]>();

/** Suffix of `reactionsCurrent.path` for a personal or guild post like. */
export function postLikeReactionPathSuffix(
  postId: string,
  groupId?: string | null
): string {
  const id = postId.trim();
  const group = groupId?.trim();
  if (group) return `/groups/${group}/content/post/${id}`;
  return `/post/${id}`;
}

export function postLikeAccountIdsCacheKey(
  postOwner: string,
  postId: string,
  opts: { groupId?: string | null; likeCount?: number } = {}
): string {
  const owner = postOwner.trim();
  const id = postId.trim();
  const group = opts.groupId?.trim() || '';
  const count =
    opts.likeCount != null && Number.isFinite(opts.likeCount)
      ? Math.max(0, Math.floor(opts.likeCount))
      : '';
  return `${owner}\0${id}\0${group}\0${count}`;
}

/** Newest-first unique account ids (stable). */
export function dedupeLikeAccountIds(
  rows: ReadonlyArray<{ accountId: string }>
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const id = row.accountId.trim();
    if (!id) continue;
    if (out.some((existing) => accountIdsEqual(existing, id))) continue;
    out.push(id);
  }
  return out;
}

/**
 * Keep the viewer's optimistic like visible before the indexer catches up.
 */
export function mergeViewerIntoLikeAccountIds(
  accountIds: readonly string[],
  viewerAccountId: string | null | undefined,
  viewerLiked: boolean
): string[] {
  const viewer = viewerAccountId?.trim();
  if (!viewer || !viewerLiked) return [...accountIds];
  if (accountIds.some((id) => accountIdsEqual(id, viewer))) {
    return [...accountIds];
  }
  return [viewer, ...accountIds];
}

function rememberSettled(key: string, ids: string[]): void {
  settled.delete(key);
  settled.set(key, ids);
  while (settled.size > SETTLED_MAX) {
    const oldest = settled.keys().next().value;
    if (oldest == null) break;
    settled.delete(oldest);
  }
}

async function fetchPostLikeAccountIds(
  postOwner: string,
  postId: string,
  opts: { groupId?: string | null; limit?: number }
): Promise<string[]> {
  const owner = postOwner.trim();
  const id = postId.trim();
  if (!owner || !id) return [];

  const suffix = postLikeReactionPathSuffix(id, opts.groupId);
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{
    reactionsCurrent: Array<{ accountId: string }>;
  }>({
    query: `query PostLikeAccounts(
      $owner: String!
      $like: String!
      $kind: String!
      $limit: Int!
    ) {
      reactionsCurrent(
        where: {
          postOwner: {_eq: $owner}
          reactionKind: {_eq: $kind}
          operation: {_eq: "set"}
          path: {_like: $like}
        }
        orderBy: [{blockHeight: DESC}]
        limit: $limit
      ) {
        accountId
      }
    }`,
    variables: {
      owner,
      like: `%${suffix}`,
      kind: DEFAULT_LIKE_KIND,
      limit: opts.limit ?? DEFAULT_LIMIT,
    },
  });

  return dedupeLikeAccountIds(res.data?.reactionsCurrent ?? []);
}

/** Sync hit from a prior warm / open — null when nothing settled yet. */
export function peekPostLikeAccountIds(
  postOwner: string,
  postId: string,
  opts: { groupId?: string | null; likeCount?: number } = {}
): string[] | null {
  const key = postLikeAccountIdsCacheKey(postOwner, postId, opts);
  const hit = settled.get(key);
  return hit ? [...hit] : null;
}

/**
 * Start the likes read on pointerdown so the sheet can paint people on open
 * (same intent warm as thread first-page).
 */
export function warmPostLikeAccountIds(
  postOwner: string,
  postId: string,
  opts: { groupId?: string | null; likeCount?: number; limit?: number } = {}
): void {
  void loadPostLikeAccountIds(postOwner, postId, opts);
}

/**
 * Account ids that currently like a post (indexer `reactionsCurrent`).
 * Shares in-flight work and keeps a short settled warm cache.
 */
export async function loadPostLikeAccountIds(
  postOwner: string,
  postId: string,
  opts: {
    groupId?: string | null;
    likeCount?: number;
    limit?: number;
  } = {}
): Promise<string[]> {
  const key = postLikeAccountIdsCacheKey(postOwner, postId, opts);
  const cached = settled.get(key);
  if (cached) return [...cached];
  const existing = inflight.get(key);
  if (existing) return existing.then((ids) => [...ids]);

  const promise = fetchPostLikeAccountIds(postOwner, postId, opts)
    .then((ids) => {
      rememberSettled(key, ids);
      return ids;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise.then((ids) => [...ids]);
}

/** Test helper — drop warm + in-flight likes reads. */
export function clearPostLikeAccountIdsCache(): void {
  inflight.clear();
  settled.clear();
}
