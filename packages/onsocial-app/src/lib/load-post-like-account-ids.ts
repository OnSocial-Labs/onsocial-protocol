import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';

const DEFAULT_LIKE_KIND = 'like';
const DEFAULT_LIMIT = 80;

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

/**
 * Account ids that currently like a post (indexer `reactionsCurrent`).
 */
export async function loadPostLikeAccountIds(
  postOwner: string,
  postId: string,
  opts: { groupId?: string | null; limit?: number } = {}
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
