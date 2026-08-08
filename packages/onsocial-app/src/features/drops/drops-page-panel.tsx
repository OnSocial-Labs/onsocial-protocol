'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  DROPS_PAGE_SIZE,
  fetchCreatorLeaders,
  fetchDropsPage,
  type CreatorLeaderRow,
  type DropDiscoveryItem,
  type DropsSort,
} from '@/features/drops/drops-data';
import {
  APP_APPS_PATH,
  APP_MARKET_PATH,
  collectionPath,
} from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

const SORTS: ReadonlyArray<{ id: DropsSort; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'minting', label: 'Minting' },
  { id: 'loved', label: 'Loved' },
  { id: 'volume', label: 'Volume' },
];

function DropRow({ item }: { item: DropDiscoveryItem }) {
  const supply =
    item.totalSupply != null
      ? `${item.mintedCount} of ${item.totalSupply}`
      : `${item.mintedCount} minted`;
  const proof =
    item.fanCount != null
      ? `${item.fanCount} loved`
      : item.remaining != null && item.remaining > 0
        ? `${item.remaining} left`
        : supply;

  return (
    <Link
      href={collectionPath(item.collectionId)}
      scroll={false}
      className="market-listing-row drops-discovery-row"
    >
      <span
        className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
        aria-hidden
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </span>
      <span className="market-listing-copy">
        <span className="market-listing-head">
          <span className="market-listing-title">{item.title}</span>
        </span>
        <span className="market-listing-creator">
          <span className="market-listing-own">by </span>@{fallbackLabel(item.creatorId)}
        </span>
        <span className="market-listing-meta market-listing-meta--price">
          {item.priceNear ? (
            <span className="market-listing-price">{item.priceNear} NEAR</span>
          ) : (
            <span className="market-listing-own">Drop</span>
          )}
          <span className="market-listing-own"> · {proof}</span>
        </span>
      </span>
    </Link>
  );
}

export function DropsPagePanel({
  initialSort = 'new',
  initialItems = [],
  initialCreators = [],
}: {
  initialSort?: DropsSort;
  initialItems?: DropDiscoveryItem[];
  initialCreators?: CreatorLeaderRow[];
}) {
  const [sort, setSort] = useState<DropsSort>(initialSort);
  const [items, setItems] = useState(initialItems);
  const [creators, setCreators] = useState(initialCreators);
  const [offset, setOffset] = useState(initialItems.length);
  const [hasMore, setHasMore] = useState(initialItems.length >= DROPS_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async (nextSort: DropsSort) => {
    setLoading(true);
    setFailed(false);
    try {
      const [page, leaders] = await Promise.all([
        fetchDropsPage({ sort: nextSort, limit: DROPS_PAGE_SIZE }),
        fetchCreatorLeaders({ limit: 8 }),
      ]);
      setItems(page.items);
      setOffset(page.items.length);
      setHasMore(page.hasMore);
      setCreators(leaders);
    } catch {
      setFailed(true);
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sort === initialSort && initialItems.length > 0) return;
    void reload(sort);
  }, [sort, initialSort, initialItems.length, reload]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    setLoading(true);
    void fetchDropsPage({ sort, limit: DROPS_PAGE_SIZE, offset })
      .then((page) => {
        setItems((current) => [...current, ...page.items]);
        setOffset((value) => value + page.items.length);
        setHasMore(page.hasMore);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  };

  return (
    <OsAppScreen
      title="Drops"
      backFallbackHref={APP_MARKET_PATH}
      toolbar={
        <div className="os-app-chrome-rail market-listing-toolbar">
          <div
            className="discover-tab-bar market-listing-filters"
            role="tablist"
            aria-label="Drop sort"
          >
            {SORTS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={sort === entry.id}
                className={`discover-tab${sort === entry.id ? ' is-active' : ''}`}
                onClick={() => setSort(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="market-page-body drops-page-body">
        {sort === 'new' && creators.length > 0 ? (
          <section className="market-section" aria-labelledby="drops-creators">
            <div className="market-section-title-row">
              <h2 id="drops-creators" className="market-section-title">
                Top creators
              </h2>
              <Link href={APP_APPS_PATH} className="market-sales-more">
                Hubs
              </Link>
            </div>
            <ul className="market-listing-list drops-creators-list">
              {creators.map((row) => (
                <li key={row.accountId}>
                  <Link
                    href={portfolioPath(row.accountId)}
                    scroll={false}
                    className="market-listing-row drops-creator-row"
                  >
                    <span className="market-listing-copy">
                      <span className="market-listing-title">
                        @{fallbackLabel(row.accountId)}
                      </span>
                      <span className="market-listing-meta">
                        {row.collectionsCreated} drops
                        {row.itemsSold > 0 ? ` · ${row.itemsSold} sold` : ''}
                        {row.revenueNear
                          ? ` · ${row.revenueNear} Ⓝ earned`
                          : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="market-section" aria-labelledby="drops-catalog">
          <h2 id="drops-catalog" className="market-section-title">
            {SORTS.find((entry) => entry.id === sort)?.label ?? 'Drops'}
          </h2>
          {failed ? (
            <p className="market-page-status">Couldn’t load drops.</p>
          ) : items.length === 0 && !loading ? (
            <p className="market-page-status">No drops yet.</p>
          ) : (
            <div className="market-listing-list" role="list">
              {items.map((item) => (
                <DropRow key={item.collectionId} item={item} />
              ))}
            </div>
          )}
          {hasMore ? (
            <button
              type="button"
              className="market-sales-more"
              disabled={loading}
              onClick={loadMore}
            >
              {loading ? 'Loading…' : 'Show more'}
            </button>
          ) : null}
        </section>

        <p className="market-page-status">
          Looking for listings? <Link href={APP_MARKET_PATH}>Open Market</Link>
        </p>
      </div>
    </OsAppScreen>
  );
}
