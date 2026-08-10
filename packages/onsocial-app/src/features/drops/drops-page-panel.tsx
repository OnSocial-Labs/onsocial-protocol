'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProfileAvatar } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
import {
  DropsHeadingActions,
  DropsSearchHeading,
} from '@/features/drops/drops-heading';
import { DropsDiscoveryRowMenu } from '@/features/drops/drops-discovery-row-menu';
import {
  DROPS_PAGE_SIZE,
  fetchCreatorLeaders,
  fetchDropsPage,
  isDropClosing,
  pickFeaturedLiveDrop,
  upcomingBucket,
  type CreatorLeaderRow,
  type DropDiscoveryItem,
  type DropsSort,
  type UpcomingBucket,
} from '@/features/drops/drops-data';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import {
  fetchAllowlistRemaining,
} from '@/features/scarces/collections-data';
import {
  ScarceFeedMediumSheet,
  resolveScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-sheet';
import {
  APP_DROP_CREATE_PATH,
  APP_MARKET_PATH,
  DROPS_SORT_PARAM,
  collectionPath,
  dropsPath,
  parseDropsSortParam,
} from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

const BASE_SORTS: ReadonlyArray<{ id: DropsSort; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'closing', label: 'Closing' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'finished', label: 'Finished' },
  { id: 'new', label: 'New' },
  { id: 'loved', label: 'Loved' },
];

const UPCOMING_SECTIONS: ReadonlyArray<{
  id: UpcomingBucket;
  label: string;
}> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
];

/** Compact relative future (`3h`, `2d`) for Opens / Ends copy. */
function formatDropRelativeFuture(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const delta = Math.max(0, ms - Date.now());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'soon';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDropWindow(ms: number, kind: 'opens' | 'ends'): string {
  const rel = formatDropRelativeFuture(ms);
  if (!rel) return '';
  if (rel === 'soon') return kind === 'opens' ? 'Opens soon' : 'Ends soon';
  return kind === 'opens' ? `Opens ${rel}` : `Ends ${rel}`;
}

/** Primary Drop mediums — same taxonomy as Market, minus listing-only noise. */
const DROP_MEDIUM_FILTERS = MARKET_MEDIUM_FILTERS.filter((entry) =>
  (
    [
      'all',
      'thought',
      'art',
      'writing',
      'audio',
      'video',
    ] as MarketMediumFilter[]
  ).includes(entry.id)
);

function fanProof(count: number): string {
  return count === 1 ? '1 fan' : `${count} fans`;
}

function dropsCountLabel(count: number): string {
  return count === 1 ? '1 drop' : `${count} drops`;
}

function dropRowProof(
  item: DropDiscoveryItem,
  sort: DropsSort,
  allowlistRemaining: number | null | undefined
): string {
  const supply =
    item.totalSupply != null
      ? `${item.mintedCount} of ${item.totalSupply}`
      : `${item.mintedCount} minted`;

  if (sort === 'loved' && item.fanCount != null) {
    return fanProof(item.fanCount);
  }

  if (sort === 'upcoming') {
    const parts: string[] = [];
    if (item.hasAllowlist) {
      if (allowlistRemaining != null && allowlistRemaining > 0) {
        parts.push("You're in");
      } else if (allowlistRemaining === 0) {
        parts.push('Allowlist');
      } else {
        parts.push('Allowlist');
      }
    }
    if (item.startTimeMs != null) {
      const opens = formatDropWindow(item.startTimeMs, 'opens');
      if (opens) parts.push(opens);
    } else if (parts.length === 0) {
      parts.push('Upcoming');
    }
    if (item.fanCount != null && item.fanCount > 0) {
      parts.push(fanProof(item.fanCount));
    }
    return parts.join(' · ');
  }

  if (sort === 'finished') {
    const soldOut =
      item.status === 'sold_out' ||
      (item.remaining != null && item.remaining <= 0);
    const endedLabel =
      item.endTimeMs != null
        ? `Ended ${formatMarketRelativeTime(item.endTimeMs)}`.trim()
        : 'Ended';
    const state = soldOut ? 'Sold out' : endedLabel;
    const parts = [state, supply];
    if (item.fanCount != null && item.fanCount > 0) {
      parts.push(fanProof(item.fanCount));
    }
    return parts.join(' · ');
  }

  if (sort === 'live' || sort === 'closing') {
    const parts: string[] = [];
    if (sort === 'closing' || isDropClosing(item)) {
      parts.push('Closing');
    }
    if (item.remaining != null && item.remaining > 0) {
      parts.push(`${item.remaining} left`);
    } else {
      parts.push(supply);
    }
    if (item.endTimeMs != null) {
      const ends = formatDropWindow(item.endTimeMs, 'ends');
      if (ends) parts.push(ends);
    }
    if (item.fanCount != null && item.fanCount > 0) {
      parts.push(fanProof(item.fanCount));
    }
    return parts.join(' · ');
  }

  const parts: string[] = [];
  if (item.remaining != null && item.remaining > 0) {
    parts.push(`${item.remaining} left`);
  } else {
    parts.push(supply);
  }
  if (item.fanCount != null && item.fanCount > 0) {
    parts.push(fanProof(item.fanCount));
  }
  return parts.join(' · ');
}

function DropRow({
  item,
  sort,
  allowlistRemaining,
  featured = false,
  saved = false,
  savePending = false,
  onToggleSave,
  onPlay,
}: {
  item: DropDiscoveryItem;
  sort: DropsSort;
  allowlistRemaining?: number | null;
  featured?: boolean;
  saved?: boolean;
  savePending?: boolean;
  onToggleSave: () => void;
  onPlay?: () => void;
}) {
  const proof = dropRowProof(item, sort, allowlistRemaining);
  const showPrice = sort !== 'finished' || Boolean(item.priceNear);
  const href = collectionPath(item.collectionId);
  const creatorHref = portfolioPath(item.creatorId);
  const creatorHandle = fallbackLabel(item.creatorId);
  const creatorLabel = displayName(
    item.creatorId,
    item.creatorDisplayName ?? undefined
  );
  const creatorNameIsCustom =
    Boolean(creatorLabel) &&
    creatorLabel.toLowerCase() !== creatorHandle.toLowerCase() &&
    creatorLabel.toLowerCase() !== item.creatorId.trim().toLowerCase();
  const droppedLabel =
    item.createdAtMs != null
      ? formatMarketRelativeTime(item.createdAtMs)
      : '';
  const blurb = item.description?.replace(/\s+/g, ' ').trim() || '';

  return (
    <div
      className={`market-listing-row drops-discovery-row${
        featured ? ' drops-discovery-row--featured' : ''
      }`}
      role="listitem"
    >
      {item.hasPlayable && onPlay ? (
        <button
          type="button"
          className={`market-listing-thumb drops-discovery-thumb${
            item.mediaUrl ? ' has-media' : ''
          }`}
          aria-label={`Listen to ${item.title}`}
          onClick={onPlay}
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" />
          )}
          <span className="market-listing-thumb-play" aria-hidden />
        </button>
      ) : (
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
      )}
      <div className="market-listing-copy drops-discovery-copy">
        {featured ? (
          <span className="drops-discovery-featured-eyebrow">Featured</span>
        ) : null}
        <div className="market-listing-head">
          <Link
            href={href}
            scroll={false}
            className="market-listing-title"
          >
            {item.title}
          </Link>
          {droppedLabel ? (
            <span className="market-listing-meta-right">{droppedLabel}</span>
          ) : null}
        </div>
        <Link
          href={creatorHref}
          scroll={false}
          className="drops-discovery-creator"
          aria-label={`Creator ${creatorLabel}`}
        >
          <ProfileAvatar
            src={item.creatorAvatarUrl}
            size="sm"
            fallbackInitial={creatorHandle.slice(0, 1)}
            className="drops-discovery-party-avatar"
          />
          <span className="drops-discovery-party-text">
            {creatorNameIsCustom ? (
              <>
                <span className="drops-discovery-party-name">
                  {creatorLabel}
                </span>
                <span className="drops-discovery-party-handle">
                  @{creatorHandle}
                </span>
              </>
            ) : (
              <span className="drops-discovery-party-name">
                @{creatorHandle}
              </span>
            )}
          </span>
        </Link>
        {blurb ? (
          <Link href={href} scroll={false} className="drops-discovery-blurb">
            {blurb}
          </Link>
        ) : null}
        <Link
          href={href}
          scroll={false}
          className="market-listing-meta market-listing-meta--price"
        >
          {showPrice && item.priceNear ? (
            <span className="market-listing-price">{item.priceNear} NEAR</span>
          ) : showPrice ? (
            <span className="market-listing-own">Drop</span>
          ) : null}
          <span className="market-listing-own">
            {showPrice ? ` · ${proof}` : proof}
          </span>
        </Link>
      </div>
      <DropsDiscoveryRowMenu
        item={item}
        saved={saved}
        savePending={savePending}
        onToggleSave={onToggleSave}
      />
    </div>
  );
}

function EmptyDropsStatus({
  sort,
  query,
}: {
  sort: DropsSort;
  query: string;
}) {
  if (query.trim()) {
    return (
      <p className="market-page-status">
        No drops match “{query.trim()}”.
      </p>
    );
  }
  if (sort === 'saved') {
    return (
      <p className="market-page-status">
        No bookmarked drops yet. Save a drop from the ⋮ menu.
      </p>
    );
  }
  if (sort === 'upcoming') {
    return (
      <p className="market-page-status">
        No upcoming drops.{' '}
        <Link href={dropsPath({ sort: 'live' })}>See Live</Link>
        {' · '}
        <Link href={APP_DROP_CREATE_PATH}>Create</Link>
      </p>
    );
  }
  if (sort === 'finished') {
    return (
      <p className="market-page-status">
        No finished drops yet.{' '}
        <Link href={dropsPath({ sort: 'live' })}>See Live</Link>
      </p>
    );
  }
  if (sort === 'closing') {
    return (
      <p className="market-page-status">
        Nothing closing right now.{' '}
        <Link href={dropsPath()}>Browse Live</Link>
      </p>
    );
  }
  if (sort === 'live') {
    return (
      <p className="market-page-status">
        No live drops right now.{' '}
        <Link href={dropsPath({ sort: 'upcoming' })}>See Upcoming</Link>
        {' · '}
        <Link href={APP_DROP_CREATE_PATH}>Create</Link>
      </p>
    );
  }
  return <p className="market-page-status">No drops yet.</p>;
}

export function DropsPagePanel({
  initialSort = 'live',
  initialItems = [],
  initialCreators = [],
}: {
  initialSort?: DropsSort;
  initialItems?: DropDiscoveryItem[];
  initialCreators?: CreatorLeaderRow[];
}) {
  const { accountId, isConnected, connect } = useAppWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSort = parseDropsSortParam(searchParams.get(DROPS_SORT_PARAM));
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const toolbarHidden = useDockAutoHide(false, scrollRootRef);

  const sorts = useMemo(() => {
    if (!isConnected) return BASE_SORTS;
    return [...BASE_SORTS, { id: 'saved' as const, label: 'Saved' }];
  }, [isConnected]);

  const [sort, setSort] = useState<DropsSort>(() =>
    searchParams.get(DROPS_SORT_PARAM) ? urlSort : initialSort
  );
  const [medium, setMedium] = useState<MarketMediumFilter>('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(initialItems);
  const [creators, setCreators] = useState(initialCreators);
  const [offset, setOffset] = useState(initialItems.length);
  const [hasMore, setHasMore] = useState(
    initialItems.length >= DROPS_PAGE_SIZE
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [allowlistById, setAllowlistById] = useState<
    Record<string, number | null>
  >({});
  const [playItem, setPlayItem] = useState<DropDiscoveryItem | null>(null);

  const collectionIds = useMemo(
    () => items.map((item) => item.collectionId),
    [items]
  );
  const { viewerSaved, isSavePending, toggleSave } = useScarceCollectionSaves({
    collectionIds,
  });

  const selectSort = useCallback(
    (next: DropsSort) => {
      if (next === 'saved' && !isConnected) {
        void connect();
        return;
      }
      setSort(next);
      router.replace(dropsPath({ sort: next }), { scroll: false });
    },
    [connect, isConnected, router]
  );

  useEffect(() => {
    if (urlSort === 'saved' && !isConnected) {
      setSort((current) => (current === 'live' ? current : 'live'));
      if (searchParams.get(DROPS_SORT_PARAM)) {
        router.replace(dropsPath(), { scroll: false });
      }
      return;
    }
    setSort((current) => (current === urlSort ? current : urlSort));
  }, [urlSort, isConnected, router, searchParams]);

  const reload = useCallback(
    async (nextSort: DropsSort, nextMedium: MarketMediumFilter) => {
      setLoading(true);
      setFailed(false);
      setItems([]);
      setOffset(0);
      setHasMore(false);
      setAllowlistById({});
      try {
        if (nextSort === 'saved' && !accountId) {
          setCreators([]);
          return;
        }
        const [page, leaders] = await Promise.all([
          fetchDropsPage({
            sort: nextSort,
            mediumKind: nextMedium === 'all' ? null : nextMedium,
            limit: DROPS_PAGE_SIZE,
            viewerAccountId: accountId,
          }),
          nextSort === 'new'
            ? fetchCreatorLeaders({ limit: 8 })
            : Promise.resolve([] as CreatorLeaderRow[]),
        ]);
        setItems(page.items);
        setOffset(page.items.length);
        setHasMore(page.hasMore);
        setCreators(leaders);
      } catch {
        setFailed(true);
        setItems([]);
        setHasMore(false);
        setCreators([]);
      } finally {
        setLoading(false);
      }
    },
    [accountId]
  );

  useEffect(() => {
    if (
      sort === initialSort &&
      sort !== 'saved' &&
      medium === 'all' &&
      initialItems.length > 0
    ) {
      return;
    }
    void reload(sort, medium);
  }, [sort, medium, initialSort, initialItems.length, reload, accountId]);

  // Soft-fill allowlist remaining for Upcoming rows (N× RPC, after paint).
  useEffect(() => {
    if (!accountId || sort !== 'upcoming') {
      setAllowlistById({});
      return;
    }
    const targets = items.filter((item) => item.hasAllowlist);
    if (targets.length === 0) {
      setAllowlistById({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        targets.map(async (item) => {
          const remaining = await fetchAllowlistRemaining(
            item.collectionId,
            accountId
          );
          return [item.collectionId.trim(), remaining] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      for (const [id, remaining] of entries) next[id] = remaining;
      setAllowlistById(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, items, sort]);

  // Soft-fill creator faces when SSR/page load missed them.
  useEffect(() => {
    const missing = items.filter(
      (item) =>
        item.creatorId.trim() &&
        item.creatorAvatarUrl === undefined &&
        item.creatorDisplayName === undefined
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { fetchCollectionCreatorFaces } = await import(
        '@/features/scarces/collection-creator-face'
      );
      const { createReadOnlyOnSocialClient } = await import(
        '@/lib/create-readonly-onsocial-client'
      );
      const faces = await fetchCollectionCreatorFaces(
        createReadOnlyOnSocialClient(),
        missing.map((item) => item.creatorId)
      );
      if (cancelled) return;
      setItems((current) =>
        current.map((item) => {
          const face = faces.get(item.creatorId.trim());
          if (!face) return item;
          if (
            item.creatorAvatarUrl !== undefined ||
            item.creatorDisplayName !== undefined
          ) {
            return item;
          }
          return {
            ...item,
            creatorAvatarUrl: face.avatarUrl,
            creatorDisplayName: face.displayName,
          };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    setLoading(true);
    void fetchDropsPage({
      sort,
      mediumKind: medium === 'all' ? null : medium,
      limit: DROPS_PAGE_SIZE,
      offset,
      viewerAccountId: accountId,
    })
      .then((page) => {
        setItems((current) => [...current, ...page.items]);
        setOffset((value) => value + page.items.length);
        setHasMore(page.hasMore);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  };

  const needle = query.trim().toLowerCase();
  const visibleItems =
    needle.length === 0
      ? items
      : items.filter((item) => {
          const title = item.title.toLowerCase();
          const creator = item.creatorId.toLowerCase();
          return title.includes(needle) || creator.includes(needle);
        });

  const featured =
    sort === 'live' &&
    needle.length === 0 &&
    !loading &&
    visibleItems.length >= 2
      ? pickFeaturedLiveDrop(visibleItems)
      : null;
  const catalogItems = featured
    ? visibleItems.filter(
        (item) => item.collectionId !== featured.collectionId
      )
    : visibleItems;

  const upcomingGroups = useMemo(() => {
    if (sort !== 'upcoming') return null;
    const groups: Record<UpcomingBucket, DropDiscoveryItem[]> = {
      today: [],
      week: [],
      later: [],
    };
    for (const item of catalogItems) {
      groups[upcomingBucket(item.startTimeMs)].push(item);
    }
    return groups;
  }, [sort, catalogItems]);

  const showCreators =
    sort === 'new' && creators.length > 0 && needle.length === 0;
  const showCatalogSkeleton = loading && items.length === 0 && !failed;

  const renderRow = (item: DropDiscoveryItem, opts?: { featured?: boolean }) => (
    <DropRow
      key={item.collectionId}
      item={item}
      sort={sort}
      featured={opts?.featured}
      allowlistRemaining={allowlistById[item.collectionId.trim()]}
      saved={viewerSaved(item.collectionId)}
      savePending={isSavePending(item.collectionId)}
      onToggleSave={() => {
        void toggleSave(item.collectionId);
      }}
      onPlay={
        item.hasPlayable
          ? () => {
              setPlayItem(item);
            }
          : undefined
      }
    />
  );

  return (
    <OsAppScreen
      title="Drops"
      leading={null}
      glassChrome
      scrollRootRef={scrollRootRef}
      backFallbackHref={APP_MARKET_PATH}
      heading={
        <DropsSearchHeading query={query} onQueryChange={setQuery} />
      }
      actions={<DropsHeadingActions />}
      toolbar={
        <div
          className={`os-app-chrome-rail market-listing-toolbar${
            toolbarHidden ? ' is-scroll-hidden' : ''
          }`}
        >
          <div className="market-listing-filter-stack">
            <div
              className="discover-tab-bar market-listing-filters"
              role="tablist"
              aria-label="Drop sort"
            >
              <div className="discover-tab-bar-scroller">
                {sorts.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={sort === entry.id}
                    className={
                      sort === entry.id ? 'is-active' : undefined
                    }
                    onClick={() => {
                      selectSort(entry.id);
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="discover-tab-bar market-listing-filters"
              role="tablist"
              aria-label="Drop medium"
            >
              <div className="discover-tab-bar-scroller">
                {DROP_MEDIUM_FILTERS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={medium === entry.id}
                    className={
                      medium === entry.id ? 'is-active' : undefined
                    }
                    onClick={() => setMedium(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      }
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div className="market-page-body drops-page-body">
          {showCreators ? (
            <section className="market-section" aria-labelledby="drops-earners">
              <div className="market-section-title-row">
                <h2 id="drops-earners" className="market-section-title">
                  Top earners
                </h2>
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
                          {dropsCountLabel(row.collectionsCreated)}
                          {row.itemsSold > 0
                            ? ` · ${row.itemsSold} sold`
                            : ''}
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
              {sorts.find((entry) => entry.id === sort)?.label ?? 'Drops'}
            </h2>
            {failed ? (
              <p className="market-page-status">Couldn’t load drops.</p>
            ) : showCatalogSkeleton ? (
              <MarketListSkeleton rows={5} />
            ) : visibleItems.length === 0 && !loading ? (
              <EmptyDropsStatus sort={sort} query={query} />
            ) : (
              <>
                {featured ? (
                  <div className="market-listing-list" role="list">
                    {renderRow(featured, { featured: true })}
                  </div>
                ) : null}
                {upcomingGroups ? (
                  UPCOMING_SECTIONS.map((section) => {
                    const rows = upcomingGroups[section.id];
                    if (rows.length === 0) return null;
                    return (
                      <div key={section.id} className="drops-upcoming-group">
                        <h3 className="market-section-title drops-upcoming-label">
                          {section.label}
                        </h3>
                        <div className="market-listing-list" role="list">
                          {rows.map((item) => renderRow(item))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="market-listing-list" role="list">
                    {catalogItems.map((item) => renderRow(item))}
                  </div>
                )}
              </>
            )}
            {hasMore && needle.length === 0 ? (
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
            Looking for secondary listings?{' '}
            <Link href={APP_MARKET_PATH}>Open Market</Link>
          </p>
        </div>

        {playItem ? (
          <ScarceFeedMediumSheet
            open
            onOpenChange={(open) => {
              if (!open) setPlayItem(null);
            }}
            mode={resolveScarceFeedMediumMode(
              playItem.mediumKind ?? playItem.view?.kind
            )}
            title={playItem.title}
            cover={playItem.mediaUrl}
            creatorId={playItem.creatorId}
            collectionId={playItem.collectionId}
            playables={playItem.view?.playables ?? []}
            viewerAccountId={accountId}
          />
        ) : null}
      </div>
    </OsAppScreen>
  );
}
