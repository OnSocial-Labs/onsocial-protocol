'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { OsSheetAction, OsSheetActions, ProfileAvatar } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import {
  arePostAuthorProfilesResolved,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
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
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import {
  fetchAllowlistRemaining,
  isCollectionMintable,
} from '@/features/scarces/collections-data';
import {
  ScarceBuySheet,
  type ScarceBuyListing,
} from '@/features/scarces/scarce-buy-sheet';
import {
  ScarceFeedMediumSheet,
  resolveScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-sheet';
import { accountIdsEqual } from '@/lib/account-match';
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

function dropsCountLabel(count: number): string {
  return count === 1 ? '1 drop' : `${count} drops`;
}

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

  if (sort === 'loved') {
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
      // Opens time lives on the action pill when set.
      parts.push('Upcoming');
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

type DropRowCommerceAction =
  | { kind: 'mint'; label: string }
  | { kind: 'opens'; label: string }
  | null;

function dropToBuyListing(item: DropDiscoveryItem): ScarceBuyListing {
  const playables = item.view?.playables ?? [];
  return {
    status: 'drop',
    collectionId: item.collectionId,
    priceNear: item.priceNear ?? '0',
    title: item.title,
    ...(item.description?.trim()
      ? { description: item.description.trim() }
      : {}),
    mediaUrl: item.mediaUrl,
    creatorId: item.creatorId,
    ...(item.creatorDisplayName
      ? { creatorName: item.creatorDisplayName }
      : {}),
    ...(item.totalSupply != null ? { copies: item.totalSupply } : {}),
    ...(item.remaining != null ? { remaining: item.remaining } : {}),
    ...(playables.length > 0
      ? { playable: playables[0], playables }
      : {}),
  };
}

/** Mint drawer, or Opens {time} when a start is set and mint isn’t open yet. */
function dropRowCommerceAction(
  item: DropDiscoveryItem,
  sort: DropsSort,
  allowlistRemaining: number | null | undefined,
  viewerId: string | null,
  nowMs: number
): DropRowCommerceAction {
  if (sort === 'finished') return null;
  if (viewerId && accountIdsEqual(viewerId, item.creatorId)) return null;

  const status = item.status;
  const soldOut =
    status === 'sold_out' ||
    (item.remaining != null && item.remaining <= 0);
  if (
    soldOut ||
    status === 'ended' ||
    status === 'cancelled' ||
    status === 'paused'
  ) {
    return null;
  }

  const earlyMint =
    status === 'upcoming' &&
    item.hasAllowlist &&
    allowlistRemaining != null &&
    allowlistRemaining > 0;
  if (earlyMint || (status != null && isCollectionMintable(status))) {
    return { kind: 'mint', label: 'Mint' };
  }

  if (status === 'upcoming' || sort === 'upcoming') {
    if (item.startTimeMs != null) {
      const opens = formatDropWindow(item.startTimeMs, 'opens', nowMs);
      if (opens) return { kind: 'opens', label: opens };
    }
    return { kind: 'opens', label: 'Upcoming' };
  }

  return null;
}

function DropRowFans({
  fanIds,
  fanCount,
}: {
  fanIds?: string[];
  fanCount: number;
}) {
  const ids = (fanIds ?? []).slice(0, 3);
  const profiles = usePostAuthorProfiles(ids);
  // Shimmer until fetch settles — avoids letter → shadow → photo flash.
  const profilesLoading =
    ids.length > 0 && !arePostAuthorProfilesResolved(ids);
  if (ids.length === 0) {
    return (
      <span className="drops-discovery-deal-bit">
        {fanCount === 1 ? '1 fan' : `${fanCount} fans`}
      </span>
    );
  }
  return (
    <span className="drops-discovery-deal-fans">
      <GuildFacepile
        memberIds={ids}
        profiles={profiles}
        memberCount={fanCount}
        countUnit={{ one: 'fan', other: 'fans' }}
        slots={Math.min(3, ids.length)}
        loading={profilesLoading}
        showCount
        className="drops-discovery-fans-facepile"
      />
    </span>
  );
}

function DropRow({
  item,
  sort,
  allowlistRemaining,
  featured = false,
  saved = false,
  savePending = false,
  viewerId = null,
  nowMs,
  onToggleSave,
  onOwnerManaged,
  onPlay,
  onMint,
}: {
  item: DropDiscoveryItem;
  sort: DropsSort;
  allowlistRemaining?: number | null;
  featured?: boolean;
  saved?: boolean;
  savePending?: boolean;
  viewerId?: string | null;
  nowMs: number;
  onToggleSave: () => void;
  onOwnerManaged?: (change: 'paused' | 'resumed' | 'deleted') => void;
  onPlay?: () => void;
  onMint: () => void;
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
      ? formatMarketRelativeTime(item.createdAtMs, nowMs)
      : '';
  // Fans render as facepile (or text fallback) — keep out of the spaced bits.
  const dealBits = [priceLabel, meta.scarcity, meta.format].filter(
    Boolean
  ) as string[];
  const fanCount =
    item.fanCount != null && item.fanCount > 0 ? item.fanCount : null;
  const commerce = dropRowCommerceAction(
    item,
    sort,
    allowlistRemaining,
    viewerId,
    nowMs
  );

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
        <div className="market-listing-head drops-discovery-head">
          <Link
            href={href}
            scroll={false}
            className="market-listing-title"
          >
            {item.title}
          </Link>
        </div>
        {/* by Name / @handle — deal spans full copy width from avatar. */}
        <div className="drops-discovery-party">
          <Link
            href={creatorHref}
            scroll={false}
            className="drops-discovery-party-avatar-link"
            tabIndex={creatorNameIsCustom ? -1 : undefined}
            aria-hidden={creatorNameIsCustom ? true : undefined}
            aria-label={
              creatorNameIsCustom ? undefined : `Creator @${creatorHandle}`
            }
          >
            <ProfileAvatar
              src={item.creatorAvatarUrl}
              size="sm"
              fallbackInitial={creatorHandle.slice(0, 1)}
              className="drops-discovery-party-avatar"
            />
          </Link>
          <div className="drops-discovery-party-stack">
            {creatorNameIsCustom ? (
              <Link
                href={creatorHref}
                scroll={false}
                className="drops-discovery-by"
              >
                by {creatorLabel}
              </Link>
            ) : (
              <Link
                href={creatorHref}
                scroll={false}
                className="drops-discovery-by"
              >
                @{creatorHandle}
              </Link>
            )}
            {creatorNameIsCustom ? (
              <span className="drops-discovery-sub">@{creatorHandle}</span>
            ) : null}
          </div>
        </div>
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
        {commerce?.kind === 'mint' ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            borderless
            className="market-listing-action drops-discovery-action"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={`Mint ${item.title}`}
              onClick={onMint}
            >
              {commerce.label}
            </OsSheetAction>
          </OsSheetActions>
        ) : commerce?.kind === 'opens' ? (
          <Link
            href={href}
            scroll={false}
            className="drops-discovery-opens-pill"
            aria-label={`${commerce.label} — open ${item.title}`}
          >
            {commerce.label}
          </Link>
        ) : null}
      </div>
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
        No loaded drops match “{query.trim()}”. Try another tab or clear search.
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
  initialHasMore,
  initialFetchFailed = false,
  initialCreators = [],
  initialNowMs,
}: {
  initialSort?: DropsSort;
  initialItems?: DropDiscoveryItem[];
  /** From SSR `fetchDropsPage`; defaults to a full-page guess. */
  initialHasMore?: boolean;
  /** True when the RSC seed request failed (not merely empty). */
  initialFetchFailed?: boolean;
  initialCreators?: CreatorLeaderRow[];
  /** SSR clock — keeps relative times / Featured stable across hydrate. */
  initialNowMs?: number;
}) {
  const { accountId, isConnected, connect } = useAppWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSort = parseDropsSortParam(searchParams.get(DROPS_SORT_PARAM));
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const toolbarHidden = useDockAutoHide(false, scrollRootRef);
  const [nowMs, setNowMs] = useState(
    () => initialNowMs ?? Date.now()
  );

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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
    () => initialHasMore ?? initialItems.length >= DROPS_PAGE_SIZE
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initialFetchFailed);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [allowlistById, setAllowlistById] = useState<
    Record<string, number | null>
  >({});
  const [playItem, setPlayItem] = useState<DropDiscoveryItem | null>(null);
  const [mintItem, setMintItem] = useState<DropDiscoveryItem | null>(null);

  const collectionIds = useMemo(
    () => items.map((item) => item.collectionId),
    [items]
  );
  const mintListing = useMemo(
    () => (mintItem ? dropToBuyListing(mintItem) : null),
    [mintItem]
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
      setLoadMoreFailed(false);
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
      reloadKey === 0 &&
      !initialFetchFailed &&
      sort === initialSort &&
      sort !== 'saved' &&
      medium === 'all' &&
      initialItems.length > 0
    ) {
      return;
    }
    void reload(sort, medium);
  }, [
    sort,
    medium,
    initialSort,
    initialItems.length,
    initialFetchFailed,
    reload,
    reloadKey,
    accountId,
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
    if (!hasMore || loading) return;
    setLoading(true);
    setLoadMoreFailed(false);
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
      .catch(() => {
        setLoadMoreFailed(true);
      })
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
      ? pickFeaturedLiveDrop(visibleItems, nowMs)
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
      groups[upcomingBucket(item.startTimeMs, nowMs)].push(item);
    }
    return groups;
  }, [sort, catalogItems, nowMs]);

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
      viewerId={accountId}
      nowMs={nowMs}
      onToggleSave={() => {
        void toggleSave(item.collectionId);
      }}
      onOwnerManaged={(change) => {
        if (change === 'deleted' || change === 'paused') {
          // Live / closing tabs hide paused & deleted; remove immediately.
          if (sort === 'live' || sort === 'closing' || change === 'deleted') {
            setItems((current) =>
              current.filter((row) => row.collectionId !== item.collectionId)
            );
            return;
          }
        }
        if (change === 'resumed') {
          setItems((current) =>
            current.map((row) =>
              row.collectionId === item.collectionId
                ? { ...row, status: 'live' as const }
                : row
            )
          );
          return;
        }
        setItems((current) =>
          current.map((row) =>
            row.collectionId === item.collectionId
              ? { ...row, status: 'paused' as const }
              : row
          )
        );
      }}
      onPlay={
        item.hasPlayable
          ? () => {
              setPlayItem(item);
            }
          : undefined
      }
      onMint={() => {
        setMintItem(item);
      }}
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
            {hasMore && needle.length === 0 && !failed ? (
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

        <ScarceBuySheet
          open={mintItem != null}
          listing={mintListing}
          onOpenChange={(open) => {
            if (!open) setMintItem(null);
          }}
          onPurchased={() => {
            setMintItem(null);
          }}
        />
      </div>
    </OsAppScreen>
  );
}
