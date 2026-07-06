// ---------------------------------------------------------------------------
// Reaction queries.
// Accessed as `os.query.reactions.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface ReactionPostRef {
  /** Post author (reaction target owner). */
  owner: string;
  /** Post id — the contract stores reactions against `post/{postId}`. */
  postId: string;
}

export interface PostReactionState {
  /** Map of kind → count, plus a `total` aggregate. */
  counts: Record<string, number>;
  /** Kinds the viewer has set on this post. Empty when no viewer given. */
  viewerReacted: string[];
}

function reactionStateKey(ref: ReactionPostRef): string {
  return `${ref.owner}:${ref.postId}`;
}

export class ReactionsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Reaction counts grouped by kind for a post. Returns a map plus a
   * `total` aggregate.
   *
   * ```ts
   * const counts = await os.query.reactions.counts('alice.near', 'post/my-post-id');
   * // counts → { like: 5, fire: 2, total: 7 }
   * ```
   */
  async counts(
    postOwner: string,
    postPath: string
  ): Promise<Record<string, number>> {
    const res = await this._q.graphql<{
      reactionCounts: Array<{
        reactionKind: string;
        reactionCount: number;
      }>;
    }>({
      query: `query ReactionCounts($owner: String!, $path: String!) {
        reactionCounts(where: {postOwner: {_eq: $owner}, postPath: {_eq: $path}}) {
          reactionKind reactionCount
        }
      }`,
      variables: { owner: postOwner, path: postPath },
    });
    const out: Record<string, number> = {};
    let total = 0;
    for (const r of res.data?.reactionCounts ?? []) {
      out[r.reactionKind] = r.reactionCount;
      total += r.reactionCount;
    }
    out.total = total;
    return out;
  }

  /**
   * Batched reaction state for a set of posts in at most two round-trips:
   * one for aggregate counts, one for the viewer's own reactions (skipped
   * when no viewer is given). Keyed by `"{owner}:{postId}"`.
   *
   * ```ts
   * const states = await os.query.reactions.statesForPosts(
   *   [{ owner: 'alice.near', postId: '1' }],
   *   { viewer: 'bob.near' }
   * );
   * // states['alice.near:1'] → { counts: { like: 2, total: 2 }, viewerReacted: ['like'] }
   * ```
   */
  async statesForPosts(
    refs: ReactionPostRef[],
    opts: { viewer?: string } = {}
  ): Promise<Record<string, PostReactionState>> {
    const unique = new Map<string, ReactionPostRef>();
    for (const ref of refs) {
      if (ref.owner && ref.postId) unique.set(reactionStateKey(ref), ref);
    }
    if (unique.size === 0) return {};

    const targets = [...unique.values()];
    const out: Record<string, PostReactionState> = {};
    const validPaths = new Set<string>();
    for (const ref of targets) {
      out[reactionStateKey(ref)] = { counts: { total: 0 }, viewerReacted: [] };
      validPaths.add(`${ref.owner}:post/${ref.postId}`);
    }

    const owners = [...new Set(targets.map((ref) => ref.owner))];
    const postPaths = [...new Set(targets.map((ref) => `post/${ref.postId}`))];

    const countsPromise = this._q.graphql<{
      reactionCounts: Array<{
        postOwner: string;
        postPath: string;
        reactionKind: string;
        reactionCount: number;
      }>;
    }>({
      query: `query PostReactionCounts($owners: [String!], $paths: [String!]) {
        reactionCounts(where: {postOwner: {_in: $owners}, postPath: {_in: $paths}}) {
          postOwner postPath reactionKind reactionCount
        }
      }`,
      variables: { owners, paths: postPaths },
    });

    const viewerPromise = opts.viewer
      ? this._q.graphql<{
          reactionsCurrent: Array<{
            postOwner: string;
            path: string;
            reactionKind: string;
          }>;
        }>({
          query: `query ViewerPostReactions($viewer: String!, $owners: [String!]) {
            reactionsCurrent(where: {
              accountId: {_eq: $viewer},
              operation: {_eq: "set"},
              postOwner: {_in: $owners}
            }) {
              postOwner path reactionKind
            }
          }`,
          variables: { viewer: opts.viewer, owners },
        })
      : null;

    const [countsRes, viewerRes] = await Promise.all([
      countsPromise,
      viewerPromise,
    ]);

    for (const row of countsRes.data?.reactionCounts ?? []) {
      if (!validPaths.has(`${row.postOwner}:${row.postPath}`)) continue;
      const postId = row.postPath.replace(/^post\//, '');
      const state = out[`${row.postOwner}:${postId}`];
      if (!state) continue;
      state.counts[row.reactionKind] = row.reactionCount;
      state.counts.total = (state.counts.total ?? 0) + row.reactionCount;
    }

    for (const row of viewerRes?.data?.reactionsCurrent ?? []) {
      const marker = row.path.lastIndexOf('/post/');
      if (marker < 0) continue;
      const postId = row.path.slice(marker + '/post/'.length);
      const state = out[`${row.postOwner}:${postId}`];
      if (!state) continue;
      state.viewerReacted.push(row.reactionKind);
    }

    return out;
  }
}
