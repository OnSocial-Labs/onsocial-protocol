'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { ListLoadError } from '@/components/panels/list-load-error';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  fetchDropsPage,
  type DropDiscoveryItem,
} from '@/features/drops/drops-data';
import {
  EVENT_WINDOW_ORDER,
  eventRowPlace,
  eventRowPrice,
  eventRowWhen,
  eventWindowLabel,
  groupEvents,
} from '@/features/events/events-catalog';
import {
  APP_EVENTS_NEW_PATH,
  APP_HOME_PATH,
  collectionPath,
} from '@/lib/app-routes';
import { DROPS_INDEX_PAGE_CLASS } from '@/lib/os-chrome-page';

const PAGE_SIZE = 48;

function EventRow({
  item,
  nowMs,
}: {
  item: DropDiscoveryItem;
  nowMs: number;
}) {
  const href = collectionPath(item.collectionId);
  const when = eventRowWhen(item, nowMs);
  const place = eventRowPlace(item);
  const price = eventRowPrice(item);
  const meta = [when, place, price].filter(Boolean).join(' · ');

  return (
    <div className="market-listing-row drops-discovery-row" role="listitem">
      <Link
        href={href}
        scroll={false}
        className={`market-listing-thumb drops-discovery-thumb${
          item.mediaUrl ? ' has-media' : ''
        }`}
        aria-label={`Open ${item.title}`}
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </Link>
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <Link href={href} scroll={false} className="market-listing-title">
            {item.title}
          </Link>
        </div>
        <Link href={href} scroll={false} className="drops-discovery-deal">
          <span className="drops-discovery-deal-bits">{meta}</span>
        </Link>
      </div>
    </div>
  );
}

export function EventsPagePanel({ initialNowMs }: { initialNowMs: number }) {
  const [items, setItems] = useState<DropDiscoveryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [nowMs, setNowMs] = useState(initialNowMs);

  const load = useCallback(async (offset: number, replace: boolean) => {
    setFailed(false);
    if (replace) setLoading(true);
    try {
      const page = await fetchDropsPage({
        sort: 'new',
        mediumKind: 'ticket',
        limit: PAGE_SIZE,
        offset,
      });
      setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
      setHasMore(page.hasMore);
      setNowMs(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0, true);
  }, [load, reloadKey]);

  const grouped = groupEvents(items, nowMs);
  const empty = !loading && !failed && items.length === 0;

  return (
    <OsAppScreen
      title="Events"
      compactChrome
      glassChrome
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      actions={
        <Link href={APP_EVENTS_NEW_PATH} scroll={false} className="os-surface-chip">
          New event
        </Link>
      }
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div className={DROPS_INDEX_PAGE_CLASS}>
          {failed ? (
            <ListLoadError
              message="Couldn’t load events."
              retryLabel="Retry"
              onRetry={() => setReloadKey((value) => value + 1)}
            />
          ) : loading && items.length === 0 ? (
            <MarketListSkeleton rows={6} variant="drops" />
          ) : empty ? (
            <p className="market-section-title">
              No events yet.{' '}
              <Link href={APP_EVENTS_NEW_PATH} scroll={false}>
                New event
              </Link>
            </p>
          ) : (
            EVENT_WINDOW_ORDER.map((window) => {
              const rows = grouped[window];
              if (rows.length === 0) return null;
              return (
                <section
                  key={window}
                  className="market-section"
                  aria-labelledby={`events-${window}`}
                >
                  <h2 id={`events-${window}`} className="market-section-title">
                    {eventWindowLabel(window)}
                  </h2>
                  <div role="list">
                    {rows.map((item) => (
                      <EventRow key={item.collectionId} item={item} nowMs={nowMs} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
          {hasMore ? (
            <button
              type="button"
              className="os-surface-chip"
              disabled={loading}
              onClick={() => void load(items.length, false)}
            >
              More
            </button>
          ) : null}
        </div>
      </div>
    </OsAppScreen>
  );
}
