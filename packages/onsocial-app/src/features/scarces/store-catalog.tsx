'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { OsChipRail } from '@/components/os/os-chip-rail';
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
import {
  fetchSeriesBrandingCached,
  prefetchSeriesBrandingForGroups,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import {
  collectionPath,
  marketAppPath,
  seriesPagePath,
} from '@/lib/app-routes';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
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
  pinned = false,
  scrollHidden = false,
}: {
  tab: StoreCatalogTab;
  onTabChange: (tab: StoreCatalogTab) => void;
  dropCount: number | null;
  /** Stick under the elevated immersive header (guild room-rail chrome). */
  pinned?: boolean;
  /** Tuck away on scroll down while pinned. */
  scrollHidden?: boolean;
}) {
  return (
    <div className={`guild-feed-filter-pin${pinned ? ' is-pinned' : ''}`}>
      <div
        className={`guild-feed-filter-pin-inner${
          pinned && scrollHidden ? ' is-scroll-hidden' : ''
        }`}
      >
        <OsChipRail
          className="market-listing-filters app-hub-catalog-tabs"
          ariaLabel="Store catalog"
          value={tab}
          onValueChange={onTabChange}
          items={[
            {
              id: 'drops' as const,
              label: (
                <>
                  {/* Count only once there is something to count — the empty
                      state already says the shelf is empty. */}
                  Drops{dropCount ? ` · ${dropCount}` : ''}
                </>
              ),
            },
            { id: 'resale' as const, label: 'Resale' },
          ]}
        />
      </div>
    </div>
  );
}

export function StoreDropCard({ view }: { view: CollectionView }) {
  const status = deriveCollectionStatus(view);
  const price = view.priceNear != null ? `${view.priceNear} NEAR` : 'Free';
  const progress = view.isVariations
    ? `${view.totalSupply} unique · ${view.remaining} left`
    : view.totalSupply > 0
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

interface DropGroup {
  key: string;
  /** Set when the group is a creator series; null for standalone drops. */
  seriesTitle: string | null;
  creatorId: string;
  seriesId: string | null;
  drops: CollectionView[];
}

/**
 * Group drops by creator series while preserving newest-first order — a
 * series appears at the position of its newest drop and collects the rest.
 * Standalone drops stay as single-item groups.
 */
function groupDropsBySeries(drops: CollectionView[]): DropGroup[] {
  const groups: DropGroup[] = [];
  const byKey = new Map<string, DropGroup>();
  for (const drop of drops) {
    const key = drop.seriesId
      ? `series:${drop.creatorId}:${drop.seriesId}`
      : `drop:${drop.collectionId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.drops.push(drop);
      continue;
    }
    const group: DropGroup = {
      key,
      seriesTitle: drop.seriesId ? (drop.seriesTitle ?? drop.seriesId) : null,
      creatorId: drop.creatorId,
      seriesId: drop.seriesId,
      drops: [drop],
    };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

/**
 * Series section heading — links to the series page and shows the creator's
 * series logo once branding loads (cached per session).
 */
function SeriesSectionHeading({ group }: { group: DropGroup }) {
  const [branding, setBranding] = useState<SeriesBranding | null>(null);
  const { creatorId, seriesId } = group;
  const profiles = usePostAuthorProfiles([creatorId]);

  useEffect(() => {
    if (!seriesId) return;
    let cancelled = false;
    void fetchSeriesBrandingCached(creatorId, seriesId).then((next) => {
      if (!cancelled) setBranding(next);
    });
    return () => {
      cancelled = true;
    };
  }, [creatorId, seriesId]);

  const title = branding?.title ?? group.seriesTitle;
  // Series logo when branded, otherwise the creator's avatar carries identity.
  const logoUrl = branding?.logoUrl ?? profiles[creatorId]?.avatarUrl ?? null;
  return (
    <h4 className="app-drop-series-title">
      <Link
        href={seriesId ? seriesPagePath(creatorId, seriesId) : '#'}
        className="app-drop-series-link"
        scroll={false}
      >
        {logoUrl ? (
          <img className="app-drop-series-logo" src={logoUrl} alt="" />
        ) : null}
        {title}
      </Link>
      <span className="app-drop-series-count">
        {' '}
        · {group.drops.length} {group.drops.length === 1 ? 'drop' : 'drops'}
      </span>
    </h4>
  );
}

/** Drops list with series sections; consecutive standalone drops share one list. */
function GroupedDropsList({ drops }: { drops: CollectionView[] }) {
  const groups = groupDropsBySeries(drops);

  useEffect(() => {
    void prefetchSeriesBrandingForGroups(groupDropsBySeries(drops));
  }, [drops]);

  const blocks: ReactNode[] = [];
  let standalone: CollectionView[] = [];

  const flushStandalone = () => {
    if (standalone.length === 0) return;
    blocks.push(
      <ul className="app-drop-list" key={`solo:${standalone[0].collectionId}`}>
        {standalone.map((drop) => (
          <li key={drop.collectionId}>
            <StoreDropCard view={drop} />
          </li>
        ))}
      </ul>
    );
    standalone = [];
  };

  for (const group of groups) {
    if (!group.seriesTitle) {
      standalone.push(...group.drops);
      continue;
    }
    flushStandalone();
    blocks.push(
      <section
        key={group.key}
        className="app-drop-series"
        aria-label={`Series: ${group.seriesTitle}`}
      >
        <SeriesSectionHeading group={group} />
        <ul className="app-drop-list">
          {group.drops.map((drop) => (
            <li key={drop.collectionId}>
              <StoreDropCard view={drop} />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  flushStandalone();

  return <div className="app-drop-groups">{blocks}</div>;
}

export function StoreDropsList({
  drops,
  loading,
  indexerCatchUp = false,
  canCreate,
  spotlight = false,
}: {
  drops: CollectionView[];
  loading: boolean;
  indexerCatchUp?: boolean;
  canCreate: boolean;
  /** Render the first drop as a large spotlight card. */
  spotlight?: boolean;
}) {
  // Soft refresh: keep painted drops; skeleton only on cold empty load.
  if (loading && drops.length === 0) {
    return (
      <div className="market-section" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading drops…</p>
        <MarketListSkeleton rows={3} />
      </div>
    );
  }
  if (drops.length === 0) {
    // No button here — creators start drops from the dock's stars action.
    return (
      <div className="standing-panel-empty-block is-centered">
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">
            {canCreate
              ? 'This is where your drops will land.'
              : 'No drops in this hub yet.'}
          </p>
          {indexerCatchUp ? (
            <p className="standing-panel-empty-secondary">
              {INDEXER_CATCH_UP_COPY}
            </p>
          ) : canCreate ? (
            <p className="standing-panel-empty-secondary">
              Tap the stars below to start your first drop.
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  const [first, ...rest] = drops;
  if (spotlight && first) {
    return (
      <div className="app-drop-catalog">
        <StoreDropSpotlightCard view={first} />
        {rest.length > 0 ? <GroupedDropsList drops={rest} /> : null}
      </div>
    );
  }
  return <GroupedDropsList drops={drops} />;
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
