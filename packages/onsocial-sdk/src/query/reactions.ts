// ---------------------------------------------------------------------------
// Reaction queries.
// Accessed as `os.query.reactions.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

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
}
