'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const TRENDING_LIMIT = 8;

/**
 * Browse-state strip for Discover: trending topics + tickers that hand off to
 * the Home focused feed. Renders nothing until at least one list resolves, so
 * a missing indexer view never leaves an empty shell.
 */
export function DiscoverTrendingStrip() {
  const [hashtags, setHashtags] = useState<HashtagCount[]>([]);
  const [tickers, setTickers] = useState<TickerCount[]>([]);

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();

    void (async () => {
      const [tags, syms] = await Promise.all([
        client.query.hashtags
          .trending({ limit: TRENDING_LIMIT })
          .catch(() => [] as HashtagCount[]),
        client.query.tickers
          .trending({ limit: TRENDING_LIMIT })
          .catch(() => [] as TickerCount[]),
      ]);
      if (cancelled) return;
      setHashtags(tags);
      setTickers(syms);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (hashtags.length === 0 && tickers.length === 0) return null;

  return (
    <div className="discover-trending-strip">
      {tickers.length > 0 ? (
        <section className="discover-trending-group">
          <h2 className="discover-trending-heading">Trending tickers</h2>
          <div className="discover-trending-chips">
            {tickers.map((item) => (
              <Link
                key={`k-${item.ticker}`}
                href={homeTickerPath(item.ticker)}
                className="discover-trending-chip discover-trending-chip--ticker"
              >
                {formatTickerDisplay(item.ticker)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {hashtags.length > 0 ? (
        <section className="discover-trending-group">
          <h2 className="discover-trending-heading">Trending topics</h2>
          <div className="discover-trending-chips">
            {hashtags.map((item) => (
              <Link
                key={`h-${item.hashtag}`}
                href={homeHashtagPath(item.hashtag)}
                className="discover-trending-chip"
              >
                #{item.hashtag}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
