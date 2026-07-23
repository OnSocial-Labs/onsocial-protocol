'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import { DiscoverFocusListSkeleton } from '@/features/discover/discover-loading-skeleton';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const LIST_LIMIT = 24;

type TopicKind = 'hashtag' | 'ticker';

/**
 * In-Discover Topics or Tickers browse: trending when empty, prefix search
 * when filtered. Rows open the Home focused feed.
 */
export function DiscoverFocusListPanel({
  kind,
  filterPrefix,
  tabId,
}: {
  kind: TopicKind;
  filterPrefix: string;
  tabId: string;
}) {
  const [rows, setRows] = useState<Array<HashtagCount | TickerCount>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const client = createReadOnlyOnSocialClient();
          const next =
            kind === 'ticker'
              ? filterPrefix
                ? await client.query.tickers.search(filterPrefix, {
                    limit: LIST_LIMIT,
                  })
                : await client.query.tickers.trending({ limit: LIST_LIMIT })
              : filterPrefix
                ? await client.query.hashtags.search(filterPrefix, {
                    limit: LIST_LIMIT,
                  })
                : await client.query.hashtags.trending({ limit: LIST_LIMIT });
          if (!cancelled) setRows(next);
        } catch (cause) {
          if (cancelled) return;
          setRows([]);
          setError(
            cause instanceof Error
              ? cause.message
              : kind === 'ticker'
                ? 'Could not load tickers.'
                : 'Could not load topics.'
          );
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, filterPrefix ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filterPrefix, kind]);

  const showColdSkeleton = loading && rows.length === 0;
  const isRefreshing = loading && rows.length > 0;

  const emptyPrimary = filterPrefix
    ? kind === 'ticker'
      ? `No tickers matching $${filterPrefix.toUpperCase()}.`
      : `No topics matching #${filterPrefix}.`
    : kind === 'ticker'
      ? 'No trending tickers yet.'
      : 'No trending topics yet.';

  const sectionHeading =
    !filterPrefix && !error && rows.length > 0
      ? kind === 'ticker'
        ? 'Trending tickers'
        : 'Trending topics'
      : filterPrefix && !error && rows.length > 0
        ? kind === 'ticker'
          ? 'Matching tickers'
          : 'Matching topics'
        : null;

  return (
    <div
      id={tabId}
      className="discover-focus-list"
      role="tabpanel"
      aria-label={kind === 'ticker' ? 'Tickers' : 'Topics'}
      aria-busy={loading || undefined}
    >
      {showColdSkeleton ? (
        <>
          <p className="sr-only">
            Loading {kind === 'ticker' ? 'tickers' : 'topics'}…
          </p>
          <DiscoverFocusListSkeleton />
        </>
      ) : null}

      {!loading && error ? (
        <div className="home-feed-state is-error">{error}</div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">{emptyPrimary}</p>
          <p className="standing-panel-empty-secondary">
            Open one to see matching posts in Home.
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div
          className={`discover-focus-list-body${
            isRefreshing ? ' is-refreshing' : ''
          }`}
        >
          {sectionHeading ? (
            <h2 className="discover-trending-heading">{sectionHeading}</h2>
          ) : null}
          <ul className="discover-focus-rows">
            {rows.map((row) => {
              if (kind === 'ticker') {
                const item = row as TickerCount;
                return (
                  <li key={`t-${item.ticker}`}>
                    <Link
                      href={homeTickerPath(item.ticker)}
                      className="discover-focus-row discover-focus-row--ticker"
                    >
                      <span className="discover-focus-row-label">
                        {formatTickerDisplay(item.ticker)}
                      </span>
                      <span className="discover-focus-row-meta">
                        {item.postCount}
                      </span>
                    </Link>
                  </li>
                );
              }

              const item = row as HashtagCount;
              return (
                <li key={`h-${item.hashtag}`}>
                  <Link
                    href={homeHashtagPath(item.hashtag)}
                    className="discover-focus-row"
                  >
                    <span className="discover-focus-row-label">
                      #{item.hashtag}
                    </span>
                    <span className="discover-focus-row-meta">
                      {item.postCount}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
