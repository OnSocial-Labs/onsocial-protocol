// ---------------------------------------------------------------------------
// Ticker (cashtag) queries.
// Accessed as `os.query.tickers.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { TickerCount } from './types.js';

export class TickersQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Trending tickers (most used, descending).
   *
   * ```ts
   * const tickers = await os.query.tickers.trending({ limit: 10 });
   * ```
   */
  async trending(opts: { limit?: number } = {}): Promise<TickerCount[]> {
    const res = await this._q.graphql<{ tickerCounts: TickerCount[] }>({
      query: `query TrendingTickers($limit: Int!) {
        tickerCounts(
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          ticker postCount lastBlock
        }
      }`,
      variables: { limit: opts.limit ?? 20 },
    });
    return res.data?.tickerCounts ?? [];
  }

  /**
   * Search tickers by prefix (for autocomplete).
   *
   * ```ts
   * const matches = await os.query.tickers.search('so', { limit: 5 });
   * ```
   */
  async search(
    prefix: string,
    opts: { limit?: number } = {}
  ): Promise<TickerCount[]> {
    const res = await this._q.graphql<{ tickerCounts: TickerCount[] }>({
      query: `query SearchTickers($prefix: String!, $limit: Int!) {
        tickerCounts(
          where: {ticker: {_like: $prefix}},
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          ticker postCount lastBlock
        }
      }`,
      variables: {
        prefix: `${prefix.toLowerCase().replace(/^\$/, '')}%`,
        limit: opts.limit ?? 10,
      },
    });
    return res.data?.tickerCounts ?? [];
  }
}
