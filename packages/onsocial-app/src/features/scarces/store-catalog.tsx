'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  fetchMarketListings,
  type MarketListingItem,
} from '@/features/market/market-listings';
import { collectionPath, marketAppPath } from '@/lib/app-routes';
import {
  INDEXER_CATCH_UP_COPY,
  INDEXER_SOFT_RETRY_MS,
} from '@/lib/indexer-soft-retry';
import { fallbackLabel } from '@/lib/profile-display';

export type StoreCatalogTab = 'drops' | 'resale';

export function StoreCatalogTabs({
  tab,
  onTabChange,
  dropCount,
}: {
  tab: StoreCatalogTab;
  onTabChange: (tab: StoreCatalogTab) => void;
  dropCount: number | null;
}) {
  return (
    <div
      className="discover-tab-bar market-listing-filters"
      role="tablist"
      aria-label="Store catalog"
    >
      <div className="discover-tab-bar-scroller">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'drops'}
          className={tab === 'drops' ? 'is-active' : undefined}
          onClick={() => onTabChange('drops')}
        >
          Drops{dropCount != null ? ` · ${dropCount}` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'resale'}
          className={tab === 'resale' ? 'is-active' : undefined}
          onClick={() => onTabChange('resale')}
        >
          Resale
        </button>
      </div>
    </div>
  );
}

export function StoreDropCard({ view }: { view: CollectionView }) {
  const status = deriveCollectionStatus(view);
  const price = view.priceNear != null ? `${view.priceNear} NEAR` : 'Free';
  const progress =
    view.totalSupply > 0
      ? `${view.minted}/${view.totalSupply}`
      : `${view.minted} minted`;

  return (
    <Link
      href={collectionPath(view.collectionId)}
      className="app-drop-card"
      scroll={false}
    >
      <span
        className={`app-drop-card-media${view.mediaUrl ? ' has-media' : ''}`}
      >
        {view.mediaUrl ? (
          <img src={view.mediaUrl} alt="" />
        ) : (
          <span aria-hidden>{view.title.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className="app-drop-card-body">
        <span className="app-drop-card-title">{view.title}</span>
        <span className="app-drop-card-meta">
          {collectionStatusLabel(status)}
          {view.kind ? ` · ${view.kind}` : ''}
          {' · '}
          {price}
        </span>
        <span className="app-drop-card-meta">
          {progress}
          {' · '}@{fallbackLabel(view.creatorId)}
        </span>
      </span>
    </Link>
  );
}

/** Latest drop rendered large — cover art, mint progress, price. */
function StoreDropSpotlightCard({ view }: { view: CollectionView }) {
  const status = deriveCollectionStatus(view);
  const price = view.priceNear != null ? `${view.priceNear} NEAR` : 'Free';
  const pct =
    view.totalSupply > 0
      ? Math.min(100, Math.round((view.minted / view.totalSupply) * 100))
      : null;
  const progress =
    view.totalSupply > 0
      ? `${view.minted}/${view.totalSupply} minted`
      : `${view.minted} minted`;

  return (
    <Link
      href={collectionPath(view.collectionId)}
      className="app-drop-spotlight"
      scroll={false}
    >
      <span
        className={`app-drop-spotlight-media${
          view.mediaUrl ? ' has-media' : ''
        }`}
      >
        {view.mediaUrl ? (
          <img src={view.mediaUrl} alt="" />
        ) : (
          <span aria-hidden>{view.title.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className="app-drop-spotlight-body">
        <span className="app-drop-spotlight-title">{view.title}</span>
        <span className="app-drop-card-meta">
          {collectionStatusLabel(status)}
          {view.kind ? ` · ${view.kind}` : ''}
          {' · '}
          {price}
        </span>
        {pct != null ? (
          <span
            className="app-drop-spotlight-progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progress}
          >
            <span
              className="app-drop-spotlight-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </span>
        ) : null}
        <span className="app-drop-card-meta">
          {progress}
          {' · '}@{fallbackLabel(view.creatorId)}
        </span>
      </span>
    </Link>
  );
}

export function StoreDropsList({
  drops,
  loading,
  indexerCatchUp = false,
  emptyActionHref,
  canCreate,
  spotlight = false,
}: {
  drops: CollectionView[];
  loading: boolean;
  indexerCatchUp?: boolean;
  emptyActionHref: string;
  canCreate: boolean;
  /** Render the first drop as a large spotlight card. */
  spotlight?: boolean;
}) {
  if (loading) {
    return (
      <div className="market-section" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading drops…</p>
        <MarketListSkeleton rows={3} />
      </div>
    );
  }
  if (drops.length === 0) {
    return (
      <div className="standing-panel-empty-block is-centered">
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">
            No drops in this hub yet.
          </p>
          {indexerCatchUp ? (
            <p className="standing-panel-empty-secondary">
              {INDEXER_CATCH_UP_COPY}
            </p>
          ) : null}
        </div>
        {canCreate ? (
          <div className="standing-panel-empty-actions">
            <Link className="standing-panel-empty-action" href={emptyActionHref}>
              Create a drop
            </Link>
          </div>
        ) : null}
      </div>
    );
  }
  const [first, ...rest] = drops;
  if (spotlight && first) {
    return (
      <div className="app-drop-catalog">
        <StoreDropSpotlightCard view={first} />
        {rest.length > 0 ? (
          <ul className="app-drop-list">
            {rest.map((drop) => (
              <li key={drop.collectionId}>
                <StoreDropCard view={drop} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  return (
    <ul className="app-drop-list">
      {drops.map((drop) => (
        <li key={drop.collectionId}>
          <StoreDropCard view={drop} />
        </li>
      ))}
    </ul>
  );
}

function formatListingPrice(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function StoreResaleCard({
  item,
  shopHref,
}: {
  item: MarketListingItem;
  shopHref: string;
}) {
  const kindLabel =
    item.kind === 'auction'
      ? 'Auction'
      : item.kind === 'lazy'
        ? 'Edition'
        : 'Fixed';
  return (
    <Link href={shopHref} className="app-drop-card" scroll={false}>
      <span
        className={`app-drop-card-media${item.mediaUrl ? ' has-media' : ''}`}
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span aria-hidden>{item.title.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className="app-drop-card-body">
        <span className="app-drop-card-title">{item.title}</span>
        <span className="app-drop-card-meta">
          {kindLabel}
          {' · '}
          {formatListingPrice(item.priceNear)} NEAR
        </span>
        <span className="app-drop-card-meta">
          @{fallbackLabel(item.creatorId)}
        </span>
      </span>
    </Link>
  );
}

/** Live Market listings for this store (indexer), peeks into full Market. */
export function StoreResalePanel({ appId }: { appId: string }) {
  const [items, setItems] = useState<MarketListingItem[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [indexerCatchUp, setIndexerCatchUp] = useState(false);
  const loading = loadedFor !== appId;
  const shopHref = marketAppPath(appId);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    async function load(): Promise<MarketListingItem[]> {
      try {
        const page = await fetchMarketListings({
          appId,
          limit: 12,
          sort: 'newest',
        });
        if (cancelled) return [];
        setItems(page.items);
        setLoadedFor(appId);
        return page.items;
      } catch {
        if (cancelled) return [];
        setItems([]);
        setLoadedFor(appId);
        return [];
      }
    }

    void load().then((next) => {
      if (cancelled || next.length > 0) {
        setIndexerCatchUp(false);
        return;
      }
      setIndexerCatchUp(true);
      INDEXER_SOFT_RETRY_MS.forEach((delay, index) => {
        timers.push(
          window.setTimeout(() => {
            void load().then((retryItems) => {
              if (cancelled) return;
              if (retryItems.length > 0) {
                setIndexerCatchUp(false);
              } else if (index === INDEXER_SOFT_RETRY_MS.length - 1) {
                setIndexerCatchUp(false);
              }
            });
          }, delay)
        );
      });
    });

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [appId]);

  if (loading) {
    return (
      <div className="market-section" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading resale…</p>
        <MarketListSkeleton rows={3} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="standing-panel-empty-block is-centered">
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">
            No resale listings for this hub yet.
          </p>
          {indexerCatchUp ? (
            <p className="standing-panel-empty-secondary">
              {INDEXER_CATCH_UP_COPY}
            </p>
          ) : null}
        </div>
        <div className="standing-panel-empty-actions">
          <Link
            className="standing-panel-empty-action"
            href={shopHref}
            scroll={false}
          >
            Open Market
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-resale-panel">
      <ul className="app-drop-list">
        {items.map((item) => (
          <li
            key={`${item.kind}:${item.listingId ?? item.tokenId ?? item.title}`}
          >
            <StoreResaleCard item={item} shopHref={shopHref} />
          </li>
        ))}
      </ul>
      <p className="app-page-note">
        <Link className="app-soon-link" href={shopHref} scroll={false}>
          Shop all on Market
        </Link>
      </p>
    </div>
  );
}
