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
   * Last distinct place mentions, newest first — Moving Mentioned chips.
   * Reads `postPlaces.blockTimestamp` (real time), not the count view.
   */
  async recentMentions(opts: { limit?: number } = {}): Promise<PlaceCount[]> {
    const limit = opts.limit ?? 6;
    try {
      const res = await this._q.graphql<{
        postPlaces: Array<{
          place: string;
          blockHeight: number;
          blockTimestamp: number;
        }>;
      }>({
        query: `query RecentPlaceMentions($limit: Int!) {
        postPlaces(orderBy: [{blockTimestamp: DESC}], limit: $limit) {
          place blockHeight blockTimestamp
        }
      }`,
        variables: { limit: Math.max(limit * 8, 24) },
      });
      const seen = new Set<string>();
      const out: PlaceCount[] = [];
      for (const row of res.data?.postPlaces ?? []) {
        const place = row.place?.trim() ?? '';
        if (!place || seen.has(place)) continue;
        seen.add(place);
        out.push({
          place,
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
