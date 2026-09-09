'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { DropRowFans } from '@/components/drops/drop-row-fans';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
import {
  DropsHeadingActions,
  DropsSearchHeading,
} from '@/features/drops/drops-heading';
import { DropsDiscoveryRowMenu } from '@/features/drops/drops-discovery-row-menu';
import {
  DROPS_BASE_SORTS,
  DropsListingToolbar,
} from '@/features/drops/drops-listing-toolbar';
import {
  DROPS_PAGE_SIZE,
  dropsItemMatchesQuery,
  fetchDropsPage,
  isDropClosing,
  softFillDropFanRosters,
  upcomingBucket,
  type DropDiscoveryItem,
  type DropsSort,
  type UpcomingBucket,
} from '@/features/drops/drops-data';
import {
  dropsShopActionLabel,
  dropsShopMintable,
} from '@/features/drops/drops-page-view';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { fetchAllowlistRemaining } from '@/features/scarces/collections-data';
import {
  ScarceFeedMediumSheet,
  resolveScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-sheet';
import {
  APP_DROP_CREATE_PATH,
  APP_MARKET_PATH,
  collectionPath,
  dropsPath,
  parseDropsMediumParam,
} from '@/lib/app-routes';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';
import {
  EMPTY_DROPS_PAGE_QUERY,
  dropsQueryPath,
  dropsSeedParamsKey,
  type DropsPageData,
  type DropsPageQuery,
} from '@/lib/load-drops-page';

/** Debounce before search keystrokes hit the indexer (snappy, still typed). */
const SEARCH_DEBOUNCE_MS = 200;

/** Keep recent catalog pages so flipping back is instant. */
const CATALOG_CACHE_TTL_MS = 90_000;
const CATALOG_CACHE_MAX_ENTRIES = 12;

type CatalogCacheEntry = {
  items: DropDiscoveryItem[];
  hasMore: boolean;
  at: number;
};

function dropsCatalogCacheKey(opts: {
  sort: DropsSort;
  medium: MarketMediumFilter;
  audioFormat: MarketAudioFormatFilter;
  search: string;
  viewer: string;
}): string {
  // Public catalogs are shared; only Saved is viewer-private.
  const viewerPart = opts.sort === 'saved' ? opts.viewer : '';
  return [
    opts.sort,
    opts.medium,
    opts.audioFormat ?? '',
    opts.search,
    viewerPart,
  ].join('|');
}

const UPCOMING_SECTIONS: ReadonlyArray<{
  id: UpcomingBucket;
  label: string;
}> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
];

/** Compact relative future (`3h`, `2d`) for Opens / Ends copy. */
function formatDropRelativeFuture(ms: number, nowMs: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const delta = Math.max(0, ms - nowMs);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'soon';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDropWindow(
  ms: number,
  kind: 'opens' | 'ends',
  nowMs: number
): string {
  const rel = formatDropRelativeFuture(ms, nowMs);
  if (!rel) return '';
  if (rel === 'soon') return kind === 'opens' ? 'Opens soon' : 'Ends soon';
  return kind === 'opens' ? `Opens ${rel}` : `Ends ${rel}`;
}

/**
 * Primary Drop mediums — Market taxonomy minus listing-only noise
 * (coupons / memberships / custom).
 */
const DROP_MEDIUM_FILTERS: ReadonlyArray<{
  id: MarketMediumFilter;
  label: string;
}> = MARKET_MEDIUM_FILTERS.filter((entry) =>
  (
    [
      'all',
      'thought',
      'art',
      'writing',
      'audio',
      'video',
      'ticket',
    ] as MarketMediumFilter[]
  ).includes(entry.id)
);

/** Release format from metadata (`extra.audioFormat`) — never invent song counts. */
function dropRowFormatLabel(item: DropDiscoveryItem): string | null {
  const format = item.view?.audioFormat;
  if (format === 'album') return 'Album';
  if (format === 'single') return 'Single';
  if (format === 'podcast') return 'Podcast';
  return null;
}

type DropRowMetaBits = {
  /** Scarcity / lifecycle — second weight after price. */
  scarcity: string | null;
  format: string | null;
};

function dropRowMetaBits(
  item: DropDiscoveryItem,
  sort: DropsSort,
  allowlistRemaining: number | null | undefined,
  formatLabel: string | null,
  nowMs: number
): DropRowMetaBits {
  const supply =
    item.totalSupply != null
      ? `${item.mintedCount} of ${item.totalSupply}`
      : `${item.mintedCount} minted`;

  if (sort === 'loved' || sort === 'traded') {
    return { scarcity: null, format: formatLabel };
  }

  if (sort === 'upcoming') {
    const parts: string[] = [];
    if (item.hasAllowlist) {
      parts.push(
        allowlistRemaining != null && allowlistRemaining > 0
          ? "You're in"
          : 'Allowlist'
      );
    } else if (item.startTimeMs == null) {
      parts.push('Upcoming');
    }
    if (item.startTimeMs != null) {
      const opens = formatDropWindow(item.startTimeMs, 'opens', nowMs);
      if (opens) parts.push(opens);
    }
    return {
      scarcity: parts.join(' · ') || null,
      format: formatLabel,
    };
  }

  if (sort === 'finished') {
    const soldOut =
      item.status === 'sold_out' ||
      (item.remaining != null && item.remaining <= 0);
    const endedLabel =
      item.endTimeMs != null
        ? `Ended ${formatMarketRelativeTime(item.endTimeMs, nowMs)}`.trim()
        : 'Ended';
    return {
      scarcity: [soldOut ? 'Sold out' : endedLabel, supply].join(' · '),
      format: formatLabel,
    };
  }

  if (sort === 'live' || sort === 'closing') {
    const parts: string[] = [];
    if (sort === 'closing' || isDropClosing(item, nowMs)) {
      parts.push('Closing');
    }
    if (item.remaining != null && item.remaining > 0) {
      parts.push(`${item.remaining} left`);
    } else {
      parts.push(supply);
    }
    if (item.endTimeMs != null) {
      const ends = formatDropWindow(item.endTimeMs, 'ends', nowMs);
      if (ends) parts.push(ends);
    }
    return {
      scarcity: parts.join(' · ') || null,
      format: formatLabel,
    };
  }

  if (item.remaining != null && item.remaining > 0) {
    return {
      scarcity: `${item.remaining} left`,
      format: formatLabel,
    };
  }
  return { scarcity: supply, format: formatLabel };
}

function DropRow({
  item,
  sort,
  allowlistRemaining,
  saved = false,
  savePending = false,
  nowMs,
  onToggleSave,
  onOwnerManaged,
  onPlay,
}: {
  item: DropDiscoveryItem;
  sort: DropsSort;
  allowlistRemaining?: number | null;
  saved?: boolean;
  savePending?: boolean;
  nowMs: number;
  onToggleSave: () => void;
  onOwnerManaged?: (change: 'paused' | 'resumed' | 'deleted') => void;
  onPlay?: () => void;
}) {
  const formatLabel = dropRowFormatLabel(item);
  const meta = dropRowMetaBits(
    item,
    sort,
    allowlistRemaining,
    formatLabel,
    nowMs
  );
  const showPrice = sort !== 'finished' || Boolean(item.priceNear);
  const priceLabel =
    showPrice && item.priceNear
      ? `${item.priceNear} NEAR`
      : showPrice
        ? 'Drop'
        : null;
  const href = collectionPath(item.collectionId);
  const droppedLabel =
    item.createdAtMs != null
      ? formatMarketRelativeTime(item.createdAtMs, nowMs)
      : '';
  // Fans render as facepile (or text fallback) — keep out of the spaced bits.
  const dealBits = [priceLabel, meta.scarcity, meta.format].filter(
    Boolean
  ) as string[];
  const fanCount =
    item.fanCount != null && item.fanCount > 0 ? item.fanCount : null;
  const action = dropsShopActionLabel(
    dropsShopMintable({
      status: item.status,
      hasAllowlist: item.hasAllowlist,
      allowlistRemaining,
    })
  );

  return (
    <div className="market-listing-row drops-discovery-row" role="listitem">
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
        <div className="market-listing-head drops-discovery-head">
          <Link
            href={href}
            scroll={false}
            className="market-listing-title"
          >
            {item.title}
          </Link>
        </div>
        <DiscoveryPartyStack
          accountId={item.creatorId}
          displayName={item.creatorDisplayName}
          avatarUrl={item.creatorAvatarUrl}
        />
        {dealBits.length > 0 || fanCount != null ? (
          <Link
            href={href}
            scroll={false}
            className="drops-discovery-deal"
            aria-label={[
              ...dealBits,
              fanCount != null
                ? fanCount === 1
                  ? '1 fan'
                  : `${fanCount} fans`
                : null,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {dealBits.length > 0 ? (
              <span className="drops-discovery-deal-bits">
                {dealBits.join(' · ')}
              </span>
            ) : null}
            {fanCount != null ? (
              <>
                {dealBits.length > 0 ? (
                  <span className="drops-discovery-deal-sep" aria-hidden>
                    {' · '}
                  </span>
                ) : null}
                <DropRowFans fanIds={item.fanIds} fanCount={fanCount} />
              </>
            ) : null}
          </Link>
        ) : null}
      </div>
      <div className="market-listing-action-col drops-discovery-action-col">
        <div className="drops-discovery-head-trail">
          {droppedLabel ? (
            <span className="market-listing-meta-right">{droppedLabel}</span>
          ) : null}
          <DropsDiscoveryRowMenu
            item={item}
            saved={saved}
            savePending={savePending}
            onToggleSave={onToggleSave}
            onOwnerManaged={onOwnerManaged}
          />
        </div>
        <Link
          href={href}
          scroll={false}
          className="page-drawer-section-action collectibles-holding-action"
          aria-label={`${action} ${item.title}`}
        >
          {action}
        </Link>
      </div>
    </div>
  );
}

function dropMediumLabel(medium: MarketMediumFilter): string | null {
  if (medium === 'all') return null;
  return DROP_MEDIUM_FILTERS.find((entry) => entry.id === medium)?.label ?? null;
}

function EmptyDropsStatus({
  sort,
  query,
  medium,
}: {
  sort: DropsSort;
  query: string;
  medium: MarketMediumFilter;
}) {
  const mediumLabel = dropMediumLabel(medium);
  if (query.trim()) {
    return <p className="market-page-status">No matches.</p>;
  }
  if (mediumLabel) {
    return (
      <p className="market-page-status">
        No {mediumLabel.toLowerCase()} drops here.{' '}
        <Link href={dropsPath({ sort })}>Clear filter</Link>
        {sort !== 'live' ? (
          <>
            {' · '}
            <Link href={dropsPath({ kind: medium })}>See Live</Link>
          </>
        ) : null}
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
  if (sort === 'new') {
    return (
      <p className="market-page-status">
        No new drops yet.{' '}
        <Link href={dropsPath()}>See Live</Link>
        {' · '}
        <Link href={dropsPath({ sort: 'upcoming' })}>See Upcoming</Link>
      </p>
    );
  }
  if (sort === 'loved') {
    return (
      <p className="market-page-status">
        No loved drops yet.{' '}
        <Link href={dropsPath()}>Browse Live</Link>
      </p>
    );
  }
  if (sort === 'traded') {
    return (
      <p className="market-page-status">
        No traded drops yet.{' '}
        <Link href={dropsPath()}>Browse Live</Link>
      </p>
    );
  }
  return <p className="market-page-status">No drops yet.</p>;
}

export function DropsPagePanel({
  seedQuery = EMPTY_DROPS_PAGE_QUERY,
  seedPromise = null,
  initialNowMs,
}: {
  seedQuery?: DropsPageQuery;
  seedPromise?: Promise<DropsPageData | null> | null;
  /** SSR clock — keeps relative times / Featured stable across hydrate. */
  initialNowMs?: number;
} = {}) {
  const { accountId, isConnected, connect } = useAppWallet();
  const router = useRouter();
  const openDropCreate = useCallback(() => {
    router.push(APP_DROP_CREATE_PATH);
  }, [router]);
  useRegisterComposeAction(
    isConnected && accountId?.trim() ? openDropCreate : null,
    'drop'
  );
  const seedKey = dropsSeedParamsKey(seedQuery);
  const [pageQuery, setPageQuery] = useState<DropsPageQuery>(seedQuery);
  const sort = pageQuery.sort;
  const medium: MarketMediumFilter = pageQuery.kind;
  const audioFormat: MarketAudioFormatFilter = pageQuery.audioFormat;
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => initialNowMs ?? Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const sorts = useMemo(() => {
    if (!isConnected) return DROPS_BASE_SORTS;
    return [...DROPS_BASE_SORTS, { id: 'saved' as const, label: 'Saved' }];
  }, [isConnected]);

  useEffect(() => {
    setPageQuery(seedQuery);
    // Key-only: a new seedQuery object with the same URL must not wipe an
    // optimistic sort / medium hop before router.replace lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey gates URL sync
  }, [seedKey]);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<DropDiscoveryItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeCatalogKey, setActiveCatalogKey] = useState(() =>
    dropsCatalogCacheKey({
      sort: seedQuery.sort,
      medium: seedQuery.kind,
      audioFormat: seedQuery.audioFormat,
      search: '',
      viewer: '',
    })
  );
  const catalogCacheRef = useRef<Map<string, CatalogCacheEntry>>(new Map());
  const reloadGenRef = useRef(0);
  const fanFillAttemptedRef = useRef<Set<string>>(new Set());
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

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const replacePageQuery = useCallback(
    (next: DropsPageQuery) => {
      setPageQuery(next);
      router.replace(dropsQueryPath(next), { scroll: false });
    },
    [router]
  );

  const selectSort = useCallback(
    (next: DropsSort) => {
      if (next === 'saved' && !isConnected) {
        void connect();
        return;
      }
      replacePageQuery({ ...pageQuery, sort: next });
    },
    [connect, isConnected, pageQuery, replacePageQuery]
  );

  const selectMedium = useCallback(
    (next: MarketMediumFilter) => {
      const kind = parseDropsMediumParam(next);
      replacePageQuery({
        ...pageQuery,
        kind,
        audioFormat: kind === 'audio' ? pageQuery.audioFormat : null,
      });
    },
    [pageQuery, replacePageQuery]
  );

  const selectAudioFormat = useCallback(
    (next: MarketAudioFormatFilter) => {
      replacePageQuery({
        ...pageQuery,
        audioFormat: next,
      });
    },
    [pageQuery, replacePageQuery]
  );

  useEffect(() => {
    if (pageQuery.sort !== 'saved' || isConnected) return;
    replacePageQuery({ ...pageQuery, sort: 'live' });
  }, [isConnected, pageQuery, replacePageQuery]);

  const patchCatalogCache = useCallback(
    (
      key: string,
      patch: (entry: CatalogCacheEntry) => CatalogCacheEntry | null
    ) => {
      const current = catalogCacheRef.current.get(key);
      if (!current) return;
      const next = patch(current);
      if (next) catalogCacheRef.current.set(key, next);
      else catalogCacheRef.current.delete(key);
    },
    []
  );

  const writeCatalogCache = useCallback(
    (key: string, entry: CatalogCacheEntry) => {
      const cache = catalogCacheRef.current;
      cache.set(key, entry);
      if (cache.size <= CATALOG_CACHE_MAX_ENTRIES) return;
      // Drop oldest by `at` (Map insertion order is not age after patches).
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [entryKey, value] of cache) {
        if (value.at < oldestAt) {
          oldestAt = value.at;
          oldestKey = entryKey;
        }
      }
      if (oldestKey) cache.delete(oldestKey);
    },
    []
  );

  const reload = useCallback(
    async (
      nextSort: DropsSort,
      nextMedium: MarketMediumFilter,
      nextSearch: string,
      nextFormat: MarketAudioFormatFilter
    ) => {
      const viewer = accountId?.trim() ?? '';
      const cacheKey = dropsCatalogCacheKey({
        sort: nextSort,
        medium: nextMedium,
        audioFormat: nextFormat,
        search: nextSearch,
        viewer,
      });
      const gen = ++reloadGenRef.current;
      setActiveCatalogKey(cacheKey);
      setFailed(false);
      setLoadMoreFailed(false);
      fanFillAttemptedRef.current = new Set();

      const cached = catalogCacheRef.current.get(cacheKey);
      const cacheFresh =
        cached != null && Date.now() - cached.at < CATALOG_CACHE_TTL_MS;
      if (cacheFresh && cached) {
        // Instant flip-back — paint cache, then soft-revalidate.
        setItems(cached.items);
        setOffset(cached.items.length);
        setHasMore(cached.hasMore);
        setLoading(false);
        setRefreshing(true);
      } else {
        // Cache miss: skeleton — do not show the previous tab's rows.
        setItems([]);
        setRefreshing(false);
        setLoading(true);
        setOffset(0);
        setHasMore(false);
        setAllowlistById({});
      }

      try {
        if (nextSort === 'saved' && !viewer) {
          if (gen !== reloadGenRef.current) return;
          setItems([]);
          setHasMore(false);
          return;
        }
        const nextKey = dropsSeedParamsKey({
          sort: nextSort,
          kind: parseDropsMediumParam(nextMedium),
          audioFormat: nextFormat,
        });
        const useSeed =
          Boolean(seedPromise) &&
          !nextSearch &&
          nextKey === seedKey;
        if (useSeed && seedPromise) {
          const data = await seedPromise;
          if (gen !== reloadGenRef.current) return;
          if (data) {
            writeCatalogCache(cacheKey, {
              items: data.items,
              hasMore: data.hasMore,
              at: Date.now(),
            });
            setItems(data.items);
            setOffset(data.items.length);
            setHasMore(data.hasMore);
            return;
          }
        }
        const page = await fetchDropsPage({
          sort: nextSort,
          mediumKind: nextMedium === 'all' ? null : nextMedium,
          search: nextSearch || null,
          audioFormat: nextFormat,
          limit: DROPS_PAGE_SIZE,
          viewerAccountId: accountId,
        });
        if (gen !== reloadGenRef.current) return;
        writeCatalogCache(cacheKey, {
          items: page.items,
          hasMore: page.hasMore,
          at: Date.now(),
        });
        setItems(page.items);
        setOffset(page.items.length);
        setHasMore(page.hasMore);
      } catch {
        if (gen !== reloadGenRef.current) return;
        setFailed(true);
        if (!cacheFresh) {
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (gen === reloadGenRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accountId, seedKey, seedPromise, writeCatalogCache]
  );

  useEffect(() => {
    void reload(sort, medium, debouncedQuery, audioFormat);
  }, [
    sort,
    medium,
    audioFormat,
    debouncedQuery,
    reload,
    reloadKey,
    accountId,
  ]);

  // Soft-fill fan counts after paint (kept off the critical fetch path).
  useEffect(() => {
    if (sort === 'loved' || sort === 'traded' || refreshing || loading) return;
    const targets = items.filter(
      (item) =>
        (item.fanCount == null || item.fanCount <= 0) &&
        !fanFillAttemptedRef.current.has(item.collectionId)
    );
    if (targets.length === 0) return;
    const targetIds = targets.map((item) => item.collectionId);
    let cancelled = false;
    void softFillDropFanRosters(targets).then((filled) => {
      if (cancelled) return;
      // Mark attempted whether or not fans were found — avoids retry storms.
      for (const id of targetIds) fanFillAttemptedRef.current.add(id);
      const byId = new Map(
        filled
          .filter((row) => row.fanCount != null && row.fanCount > 0)
          .map((row) => [row.collectionId.trim(), row] as const)
      );
      if (byId.size === 0) return;
      setItems((current) => {
        let changed = false;
        const next = current.map((item) => {
          const row = byId.get(item.collectionId.trim());
          if (!row) return item;
          changed = true;
          return {
            ...item,
            fanCount: row.fanCount,
            ...(row.fanIds ? { fanIds: row.fanIds } : {}),
          };
        });
        if (changed) {
          patchCatalogCache(activeCatalogKey, (entry) => ({
            ...entry,
            items: entry.items.map((item) => {
              const row = byId.get(item.collectionId.trim());
              if (!row) return item;
              return {
                ...item,
                fanCount: row.fanCount,
                ...(row.fanIds ? { fanIds: row.fanIds } : {}),
              };
            }),
          }));
        }
        return changed ? next : current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    items,
    sort,
    refreshing,
    loading,
    activeCatalogKey,
    patchCatalogCache,
  ]);

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
    if (!hasMore || loading || refreshing) return;
    const gen = reloadGenRef.current;
    const catalogKey = activeCatalogKey;
    const pageOffset = offset;
    setLoading(true);
    setLoadMoreFailed(false);
    void fetchDropsPage({
      sort,
      mediumKind: medium === 'all' ? null : medium,
      search: debouncedQuery || null,
      audioFormat,
      limit: DROPS_PAGE_SIZE,
      offset: pageOffset,
      viewerAccountId: accountId,
    })
      .then((page) => {
        if (gen !== reloadGenRef.current) return;
        setItems((current) => {
          const merged = [...current, ...page.items];
          patchCatalogCache(catalogKey, (entry) => ({
            ...entry,
            items: merged,
            hasMore: page.hasMore,
            at: Date.now(),
          }));
          return merged;
        });
        setOffset(pageOffset + page.items.length);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (gen !== reloadGenRef.current) return;
        setLoadMoreFailed(true);
      })
      .finally(() => {
        if (gen === reloadGenRef.current) setLoading(false);
      });
  };

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  // Live keystrokes filter the current page; debounced query drives the indexer.
  const visibleItems =
    !searching || needle === debouncedQuery.toLowerCase()
      ? items
      : items.filter((item) => dropsItemMatchesQuery(item, needle));

  const upcomingGroups = useMemo(() => {
    if (sort !== 'upcoming') return null;
    const groups: Record<UpcomingBucket, DropDiscoveryItem[]> = {
      today: [],
      week: [],
      later: [],
    };
    for (const item of visibleItems) {
      groups[upcomingBucket(item.startTimeMs, nowMs)].push(item);
    }
    return groups;
  }, [sort, visibleItems, nowMs]);

  const showCatalogSkeleton =
    loading && items.length === 0 && !failed && !searching;
  const catalogRefreshing = refreshing && items.length > 0;

  const renderRow = (item: DropDiscoveryItem) => (
    <DropRow
      key={item.collectionId}
      item={item}
      sort={sort}
      allowlistRemaining={allowlistById[item.collectionId.trim()]}
      saved={viewerSaved(item.collectionId)}
      savePending={isSavePending(item.collectionId)}
      nowMs={nowMs}
      onToggleSave={() => {
        void toggleSave(item.collectionId);
      }}
      onOwnerManaged={(change) => {
        const id = item.collectionId;
        if (change === 'deleted' || change === 'paused') {
          // Live / closing tabs hide paused & deleted; remove immediately.
          if (sort === 'live' || sort === 'closing' || change === 'deleted') {
            setItems((current) =>
              current.filter((row) => row.collectionId !== id)
            );
            patchCatalogCache(activeCatalogKey, (entry) => ({
              ...entry,
              items: entry.items.filter((row) => row.collectionId !== id),
            }));
            return;
          }
        }
        if (change === 'resumed') {
          setItems((current) =>
            current.map((row) =>
              row.collectionId === id
                ? { ...row, status: 'live' as const }
                : row
            )
          );
          patchCatalogCache(activeCatalogKey, (entry) => ({
            ...entry,
            items: entry.items.map((row) =>
              row.collectionId === id
                ? { ...row, status: 'live' as const }
                : row
            ),
          }));
          return;
        }
        setItems((current) =>
          current.map((row) =>
            row.collectionId === id
              ? { ...row, status: 'paused' as const }
              : row
          )
        );
        patchCatalogCache(activeCatalogKey, (entry) => ({
          ...entry,
          items: entry.items.map((row) =>
            row.collectionId === id
              ? { ...row, status: 'paused' as const }
              : row
          ),
        }));
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
      compactChrome
      scrollTuck="search"
      scrollTuckPinned={filterMenuOpen}
      dockBack
      leading={null}
      glassChrome
      scrollRootRef={scrollRootRef}
      backFallbackHref={OS_INDEX_LEAVE_HREF}
      heading={
        <DropsSearchHeading query={query} onQueryChange={setQuery} />
      }
      actions={<DropsHeadingActions />}
      toolbar={
        <DropsListingToolbar
          ready
          sort={sort}
          medium={medium}
          audioFormat={audioFormat}
          showSaved={isConnected}
          onSortChange={selectSort}
          onMediumChange={selectMedium}
          onAudioFormatChange={selectAudioFormat}
          onClear={() => selectMedium('all')}
          onMenuOpenChange={setFilterMenuOpen}
        />
      }
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div className="market-page-body drops-page-body">
          <section
            className={`market-section${
              catalogRefreshing ? ' drops-catalog--refreshing' : ''
            }`}
            aria-labelledby="drops-catalog"
            aria-busy={catalogRefreshing || undefined}
          >
            <h2 id="drops-catalog" className="market-section-title">
              {sorts.find((entry) => entry.id === sort)?.label ?? 'Drops'}
            </h2>
            {failed ? (
              <p className="market-page-status" role="alert">
                Couldn’t load drops.{' '}
                <button
                  type="button"
                  className="market-page-retry"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  Retry
                </button>
              </p>
            ) : showCatalogSkeleton ? (
              <MarketListSkeleton rows={5} />
            ) : visibleItems.length === 0 &&
              !loading &&
              (!searching || needle === debouncedQuery.toLowerCase()) ? (
              <EmptyDropsStatus sort={sort} query={query} medium={medium} />
            ) : (
              <>
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
                    {visibleItems.map((item) => renderRow(item))}
                  </div>
                )}
              </>
            )}
            {loadMoreFailed ? (
              <p className="market-page-status" role="alert">
                Couldn’t load more.{' '}
                <button
                  type="button"
                  className="market-page-retry"
                  onClick={loadMore}
                >
                  Retry
                </button>
              </p>
            ) : null}
            {hasMore &&
            items.length > 0 &&
            (!searching || needle === debouncedQuery.toLowerCase()) &&
            !failed &&
            !refreshing ? (
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
