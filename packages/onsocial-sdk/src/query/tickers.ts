// ---------------------------------------------------------------------------
// Ticker (cashtag) queries.
// Accessed as `os.query.tickers.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { TickerCount } from './types.js';

export class TickersQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Trending tickers. Default `count` is lifetime post count (Tickers tab).
   * `recent` is last mention, then count (Discover Moving chips).
   *
   * ```ts
   * const tickers = await os.query.tickers.trending({ limit: 10 });
   * const moving = await os.query.tickers.trending({ limit: 6, sort: 'recent' });
   * ```
   */
  async trending(
    opts: { limit?: number; sort?: 'count' | 'recent' } = {}
  ): Promise<TickerCount[]> {
    const orderBy =
      opts.sort === 'recent'
        ? '[{lastBlock: DESC}, {postCount: DESC}]'
        : '[{postCount: DESC}]';
    const res = await this._q.graphql<{ tickerCounts: TickerCount[] }>({
      query: `query TrendingTickers($limit: Int!) {
        tickerCounts(
          orderBy: ${orderBy},
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
   * Last distinct ticker mentions, newest first — Moving Mentioned chips.
   * Reads `postTickers.blockTimestamp` (real time), not the count view.
   */
  async recentMentions(
    opts: { limit?: number } = {}
  ): Promise<TickerCount[]> {
    const limit = opts.limit ?? 6;
    try {
      const res = await this._q.graphql<{
        postTickers: Array<{
          ticker: string;
          blockHeight: number;
          blockTimestamp: number;
        }>;
      }>({
        query: `query RecentTickerMentions($limit: Int!) {
        postTickers(orderBy: [{blockTimestamp: DESC}], limit: $limit) {
          ticker blockHeight blockTimestamp
        }
      }`,
        variables: { limit: Math.max(limit * 8, 24) },
      });
      const seen = new Set<string>();
      const out: TickerCount[] = [];
      for (const row of res.data?.postTickers ?? []) {
        const ticker = row.ticker?.trim() ?? '';
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);
        out.push({
          ticker,
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
