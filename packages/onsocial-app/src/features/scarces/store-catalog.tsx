'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchMarketListings,
  type MarketListingItem,
} from '@/features/market/market-listings';
import { collectionPath, marketAppPath } from '@/lib/app-routes';
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

export function StoreDropsList({
  drops,
  loading,
  emptyActionHref,
  canCreate,
}: {
  drops: CollectionView[];
  loading: boolean;
  emptyActionHref: string;
  canCreate: boolean;
}) {
  if (loading) {
    return <p className="market-page-status">Loading drops…</p>;
  }
  if (drops.length === 0) {
    return (
      <p className="market-page-status">
        No drops in this store yet.
        {canCreate ? (
          <>
            {' '}
            <Link className="app-soon-link" href={emptyActionHref}>
              Create a drop
            </Link>
          </>
        ) : null}
      </p>
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
  const loading = loadedFor !== appId;
  const shopHref = marketAppPath(appId);

  useEffect(() => {
    let cancelled = false;
    void fetchMarketListings({ appId, limit: 12, sort: 'newest' }).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        setLoadedFor(appId);
      },
      () => {
        if (cancelled) return;
        setItems([]);
        setLoadedFor(appId);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [appId]);

  if (loading) {
    return <p className="market-page-status">Loading resale…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="market-page-status">
        No resale listings for this store yet.{' '}
        <Link className="app-soon-link" href={shopHref} scroll={false}>
          Open Market
        </Link>
      </p>
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
