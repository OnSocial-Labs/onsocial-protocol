// ---------------------------------------------------------------------------
// Hashtag queries.
// Accessed as `os.query.hashtags.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { HashtagCount } from './types.js';

export class HashtagsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Trending hashtags (most used, descending).
   *
   * ```ts
   * const tags = await os.query.hashtags.trending({ limit: 10 });
   * ```
   */
  async trending(opts: { limit?: number } = {}): Promise<HashtagCount[]> {
    const res = await this._q.graphql<{ hashtagCounts: HashtagCount[] }>({
      query: `query TrendingHashtags($limit: Int!) {
        hashtagCounts(
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          hashtag postCount lastBlock
        }
      }`,
      variables: { limit: opts.limit ?? 20 },
    });
    return res.data?.hashtagCounts ?? [];
  }

  /**
   * Search hashtags by prefix (for autocomplete).
   *
   * ```ts
   * const matches = await os.query.hashtags.search('on', { limit: 5 });
   * ```
   */
  async search(
    prefix: string,
    opts: { limit?: number } = {}
  ): Promise<HashtagCount[]> {
    const res = await this._q.graphql<{ hashtagCounts: HashtagCount[] }>({
      query: `query SearchHashtags($prefix: String!, $limit: Int!) {
        hashtagCounts(
          where: {hashtag: {_like: $prefix}},
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          hashtag postCount lastBlock
        }
      }`,
      variables: {
        prefix: `${prefix.toLowerCase().replace(/^#/, '')}%`,
        limit: opts.limit ?? 10,
      },
    });
    return res.data?.hashtagCounts ?? [];
  }
}
