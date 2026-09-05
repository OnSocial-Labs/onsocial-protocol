// ---------------------------------------------------------------------------
// Hashtag queries.
// Accessed as `os.query.hashtags.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { HashtagCount } from './types.js';

export class HashtagsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Trending hashtags. Default `count` is lifetime post count (Topics tab).
   * `recent` is last mention, then count (Discover Moving chips).
   *
   * ```ts
   * const tags = await os.query.hashtags.trending({ limit: 10 });
   * const moving = await os.query.hashtags.trending({ limit: 6, sort: 'recent' });
   * ```
   */
  async trending(
    opts: { limit?: number; sort?: 'count' | 'recent' } = {}
  ): Promise<HashtagCount[]> {
    const orderBy =
      opts.sort === 'recent'
        ? '[{lastBlock: DESC}, {postCount: DESC}]'
        : '[{postCount: DESC}]';
    const res = await this._q.graphql<{ hashtagCounts: HashtagCount[] }>({
      query: `query TrendingHashtags($limit: Int!) {
        hashtagCounts(
          orderBy: ${orderBy},
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
   * Last distinct hashtag mentions, newest first — Moving Mentioned chips.
   * Reads `postHashtags.blockTimestamp` (real time), not the count view.
   */
  async recentMentions(opts: { limit?: number } = {}): Promise<HashtagCount[]> {
    const limit = opts.limit ?? 6;
    try {
      const res = await this._q.graphql<{
        postHashtags: Array<{
          hashtag: string;
          blockHeight: number;
          blockTimestamp: number;
        }>;
      }>({
        query: `query RecentHashtagMentions($limit: Int!) {
        postHashtags(orderBy: [{blockTimestamp: DESC}], limit: $limit) {
          hashtag blockHeight blockTimestamp
        }
      }`,
        variables: { limit: Math.max(limit * 8, 24) },
      });
      const seen = new Set<string>();
      const out: HashtagCount[] = [];
      for (const row of res.data?.postHashtags ?? []) {
        const hashtag = row.hashtag?.trim() ?? '';
        if (!hashtag || seen.has(hashtag)) continue;
        seen.add(hashtag);
        out.push({
          hashtag,
          postCount: 0,
          lastBlock: Number(row.blockHeight) || 0,
          lastTimestamp: Number(row.blockTimestamp) || 0,
        });
        if (out.length >= limit) break;
      }
      return out;
    } catch {
      return [];
    }
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
