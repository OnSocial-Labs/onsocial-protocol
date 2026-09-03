// ---------------------------------------------------------------------------
// Place queries.
// Accessed as `os.query.places.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { PlaceCount } from './types.js';

export class PlacesQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Trending places. Default `count` is lifetime post count.
   * `recent` is last mention, then count (Discover Moving chips).
   *
   * ```ts
   * const places = await os.query.places.trending({ limit: 10 });
   * const moving = await os.query.places.trending({ limit: 6, sort: 'recent' });
   * ```
   */
  async trending(
    opts: { limit?: number; sort?: 'count' | 'recent' } = {}
  ): Promise<PlaceCount[]> {
    const orderBy =
      opts.sort === 'recent'
        ? '[{lastBlock: DESC}, {postCount: DESC}]'
        : '[{postCount: DESC}]';
    const res = await this._q.graphql<{ placeCounts: PlaceCount[] }>({
      query: `query TrendingPlaces($limit: Int!) {
        placeCounts(
          orderBy: ${orderBy},
          limit: $limit
        ) {
          place postCount lastBlock
        }
      }`,
      variables: { limit: opts.limit ?? 20 },
    });
    return res.data?.placeCounts ?? [];
  }

  /**
   * Search places by prefix (for autocomplete).
   *
   * ```ts
   * const matches = await os.query.places.search('lis', { limit: 5 });
   * ```
   */
  async search(
    prefix: string,
    opts: { limit?: number } = {}
  ): Promise<PlaceCount[]> {
    const res = await this._q.graphql<{ placeCounts: PlaceCount[] }>({
      query: `query SearchPlaces($prefix: String!, $limit: Int!) {
        placeCounts(
          where: {place: {_like: $prefix}},
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          place postCount lastBlock
        }
      }`,
      variables: {
        prefix: `${prefix.toLowerCase().replace(/^#+/, '')}%`,
        limit: opts.limit ?? 10,
      },
    });
    return res.data?.placeCounts ?? [];
  }
}
