'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import { DiscoverFocusListSkeleton } from '@/features/discover/discover-loading-skeleton';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import {
  discoverTopicsLead,
  discoverTickersLead,
} from '@/lib/discover-tab-lead';
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
  initialRows = null,
}: {
  kind: TopicKind;
  filterPrefix: string;
  tabId: string;
  /** SSR trending seed when the filter is empty. */
  initialRows?: Array<HashtagCount | TickerCount> | null;
}) {
  const [rows, setRows] = useState<Array<HashtagCount | TickerCount>>(
    () => (!filterPrefix && initialRows ? initialRows : [])
  );
  const [loading, setLoading] = useState(
    () => !(!filterPrefix && initialRows != null)
  );
  const [error, setError] = useState<string | null>(null);
  const hasPaintedRef = useRef(
    Boolean(!filterPrefix && initialRows && initialRows.length > 0)
  );

  useEffect(() => {
    let cancelled = false;
    const soft = !filterPrefix && hasPaintedRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!soft) {
          setLoading(true);
        }
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
          if (!cancelled) {
            setRows(next);
            hasPaintedRef.current = next.length > 0 && !filterPrefix;
          }
        } catch (cause) {
          if (cancelled) return;
          if (!soft) {
            setRows([]);
            setError(
              cause instanceof Error
                ? cause.message
                : kind === 'ticker'
                  ? 'Could not load tickers.'
                  : 'Could not load topics.'
            );
          }
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

  const showColdSkeleton = loading && rows.length === 0 && !filterPrefix;
  const isRefreshing = loading && rows.length > 0;

  const emptyPrimary = filterPrefix
    ? 'No matches.'
    : kind === 'ticker'
      ? 'No trending tickers yet.'
      : 'No trending topics yet.';

  const sectionHeading =
    filterPrefix && !error && rows.length > 0
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
      <DiscoverTabLead>
        {kind === 'ticker'
          ? discoverTickersLead(filterPrefix)
          : discoverTopicsLead(filterPrefix)}
      </DiscoverTabLead>

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
          {filterPrefix ? null : (
            <p className="standing-panel-empty-secondary">
              Open one to see matching posts in Home.
            </p>
          )}
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
