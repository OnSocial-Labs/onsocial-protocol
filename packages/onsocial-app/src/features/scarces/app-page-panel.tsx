'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Divider,
  InformationCircleIcon,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  SettingsIcon,
  SheetHandoffProvider,
  ipfsImgSrcSet,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  APP_COLUMN_HERO_SIZES,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';
import { useImmersiveTitleHandoff } from '@/hooks/use-immersive-title-handoff';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import {
  appVolumeNearLabel,
  canCreateInApp,
  creatorAccessShort,
  fetchApp,
  fetchAppIndexerRow,
  fetchAppStats,
  isAppAuthority,
  isAppOwner,
  type AppStatsView,
  type AppView,
} from '@/features/scarces/apps-data';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import { HeldEditionFollow } from '@/features/collectibles/held-edition-follow';
import { GuildDescriptionClamp } from '@/features/guilds/guild-description-clamp';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { guildCoverStyle } from '@/features/guilds/guild-visual';
import {
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import {
  HubCreatorsSheet,
  HubFactsSheet,
} from '@/features/scarces/hub-info-sheets';
import {
  HubAccessSheet,
  HubLookSheet,
  HubPeopleSheet,
  HubTransferSheet,
  type HubManageSheetId,
} from '@/features/scarces/hub-manage-sheets';
import { HubPageSkeleton } from '@/features/scarces/hub-page-skeleton';
import {
  hubActivityMeta,
  hubCatalogShell,
  hubPageBackHref,
  hubRouteYieldsLoadingSkeleton,
  hubUseFirst,
  ownedItemsInHub,
  peekHeldHubItems,
} from '@/features/scarces/hub-page-view';
import { HubPublishAccessSheet } from '@/features/scarces/hub-publish-access-sheet';
import { HubPublishRequestsSheet } from '@/features/scarces/hub-publish-requests-sheet';
import { HubSettingsSheet } from '@/features/scarces/hub-settings-sheet';
import {
  fetchCollectionsByAppPage,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { groupSeriesDrops } from '@/features/scarces/series-catalog';
import { heldCollectionIdSet } from '@/features/scarces/series-page-view';
import { SeriesShopGroupList } from '@/features/scarces/series-page-panel';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { CATALOG_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import {
  fetchMyStorePublishDecision,
  fetchMyStorePublishRequest,
  fetchStorePublishDecisions,
  fetchStorePublishRequests,
  filterActionablePublishRequests,
  isStorePublishRequestRejected,
} from '@/features/scarces/store-publish-requests';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  APP_APPS_PATH,
  APP_DROP_CREATE_PATH,
  MARKET_APP_PARAM,
} from '@/lib/app-routes';
import { MARKET_PAGE_CLASS, osChromePageClassName } from '@/lib/os-chrome-page';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { OsRowAction } from '@/lib/os-row-action';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import { portfolioCollectiblesPath, portfolioPath } from '@/lib/overlay-routes';
import {
  groupHoldingsForRail,
  ownedScarceFromPeek,
  toPortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { displayName } from '@/lib/profile-display';
import { formatProfileCount } from '@/lib/profile-social-standings';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

/** Two-letter monogram from the store name for the logo fallback. */
function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppPagePanel({
  appId,
  initial,
  initialStats = null,
  initialDrops = null,
  initialDropsFetched,
}: {
  appId: string;
  initial: AppView | null;
  initialStats?: AppStatsView | null;
  initialDrops?: CollectionView[] | null;
  /** Raw rows behind `initialDrops`. Falls back to the filtered length. */
  initialDropsFetched?: number;
}) {
  const router = useRouter();
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const clientMounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const [app, setApp] = useState<AppView | null>(initial);
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<AppStatsView | null>(() => initialStats);
  const [nowMs] = useState(() => Date.now());
  const ssrMiss = initialDrops == null || initialDrops.length === 0;
  const [drops, setDrops] = useState<CollectionView[]>(
    () => initialDrops ?? []
  );
  const seededFetched =
    initialDrops == null ? 0 : (initialDropsFetched ?? initialDrops.length);
  const [dropsHasMore, setDropsHasMore] = useState(seededFetched >= 48);
  const [dropsOffset, setDropsOffset] = useState(seededFetched);
  const [dropsLoadingMore, setDropsLoadingMore] = useState(false);
  const [dropsLoadMoreFailed, setDropsLoadMoreFailed] = useState(false);
  const dropsSentinelRef = useRef<HTMLDivElement | null>(null);
  const [catalogSettled, setCatalogSettled] = useState(!ssrMiss);
  const [fetchedOwned, setFetchedOwned] = useState<{
    key: string;
    items: OwnedScarceItem[];
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishAccessOpen, setPublishAccessOpen] = useState(false);
  const [publishAccessRefreshKey, setPublishAccessRefreshKey] = useState(0);
  const [myPublishPending, setMyPublishPending] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [editionPick, setEditionPick] = useState<{
    title: string;
    editions: OwnedScarceItem[];
  } | null>(null);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  const [pendingPublishSnapshot, setPendingPublishSnapshot] = useState<{
    appId: string;
    count: number;
  } | null>(null);
  const [manageSheet, setManageSheet] = useState<HubManageSheetId | null>(null);
  const [sheetHandoff, setSheetHandoff] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const dropsKey = `${appId}:${refreshKey}`;
  const hasApp = app != null;
  const collectionIds = useMemo(
    () => drops.map((drop) => drop.collectionId).filter(Boolean),
    [drops]
  );
  const holdMatch = useMemo(
    () => ({ appId, collectionIds }),
    [appId, collectionIds]
  );
  const holdKey = `${viewerAccountId ?? ''}:${appId}:${collectionIds.join(',')}`;

  // Indexer paints the hero first when the server had nothing cached.
  useEffect(() => {
    if (initial || app) return;
    let cancelled = false;
    void fetchAppIndexerRow(appId).then((row) => {
      if (cancelled || !row) return;
      setApp((prev) => prev ?? row);
    });
    return () => {
      cancelled = true;
    };
  }, [appId, initial, app]);

  // Contract record reconciles roster / commission / access (ACL truth).
  useEffect(() => {
    let cancelled = false;
    void fetchApp(appId).then((next) => {
      if (cancelled) return;
      if (next) {
        setApp(next);
        setNotFound(false);
      } else {
        setApp((prev) => {
          if (!prev) setNotFound(true);
          return prev;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appId, refreshKey]);

  // Rolled-up hub stats — soft refresh after SSR seed.
  useEffect(() => {
    if (refreshKey === 0 && initialStats != null) return;
    let cancelled = false;
    void fetchAppStats(appId).then((next) => {
      if (!cancelled) setStats(next);
    });
    return () => {
      cancelled = true;
    };
  }, [appId, refreshKey, initialStats]);

  useEffect(() => {
    // SSR drops already painted — refetch only after publish / refresh.
    if (refreshKey === 0 && initialDrops != null) {
      if (initialDrops.length > 0) return;
      // Empty seed: soft indexer catch-up below.
    }

    let cancelled = false;
    const timers: number[] = [];

    async function load(): Promise<CollectionView[]> {
      try {
        const page = await fetchCollectionsByAppPage(appId, {
          limit: 48,
          offset: 0,
        });
        if (cancelled) return [];
        setDrops(page.views);
        setDropsOffset(page.fetched);
        setDropsHasMore(page.fetched >= 48);
        return page.views;
      } catch {
        if (cancelled) return [];
        setDrops([]);
        return [];
      }
    }

    void load().then((next) => {
      if (!cancelled) setCatalogSettled(true);
      if (cancelled || next.length > 0) return;
      INDEXER_SOFT_RETRY_MS.forEach((delay) => {
        timers.push(
          window.setTimeout(() => {
            void load();
          }, delay)
        );
      });
    });

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [appId, dropsKey, initialDrops, refreshKey]);

  // Title handoff: the bar name tracks scroll. No React state — a render here jumps the page.
  useImmersiveTitleHandoff(
    scrollRootRef,
    heroTitleRef,
    hasApp,
    app?.appId ?? null
  );

  const owner = useMemo(
    () => (app ? isAppOwner(app, viewerAccountId ?? null) : false),
    [app, viewerAccountId]
  );
  const authority = useMemo(
    () => (app ? isAppAuthority(app, viewerAccountId ?? null) : false),
    [app, viewerAccountId]
  );
  const canCreate = useMemo(
    () => (app ? canCreateInApp(app, viewerAccountId ?? null) : false),
    [app, viewerAccountId]
  );

  const rosterIds = useMemo(() => {
    if (!app) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of [
      app.ownerId,
      ...app.moderators,
      ...(app.creatorAccess === 'approval' ? app.approvedCreators : []),
    ]) {
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      ids.push(trimmed);
    }
    return ids;
  }, [app]);
  const rosterProfiles = usePostAuthorProfiles(rosterIds.slice(0, 4));

  const onManaged = useCallback(() => setRefreshKey((k) => k + 1), []);

  const canReviewRequests = Boolean(
    authority && app?.creatorAccess === 'approval'
  );
  const reviewAppId = canReviewRequests && app ? app.appId : null;
  const approvedCreatorsKey = useMemo(
    () =>
      (app?.approvedCreators ?? [])
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|'),
    [app?.approvedCreators]
  );
  const pendingPublishCount =
    reviewAppId && pendingPublishSnapshot?.appId === reviewAppId
      ? pendingPublishSnapshot.count
      : 0;

  // Soft mailbox count for the settings gear / Publish requests row.
  useEffect(() => {
    if (!reviewAppId) return;
    let cancelled = false;
    const approved = approvedCreatorsKey ? approvedCreatorsKey.split('|') : [];
    void Promise.all([
      fetchStorePublishRequests(reviewAppId),
      fetchStorePublishDecisions(reviewAppId),
    ]).then(([rows, decisions]) => {
      if (cancelled) return;
      setPendingPublishSnapshot({
        appId: reviewAppId,
        count: filterActionablePublishRequests(rows, approved, decisions)
          .length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reviewAppId, approvedCreatorsKey, refreshKey]);

  // Dock stars only when the viewer can create drops. Request-to-publish
  // lives opposite the hero meta (guild Join / Request pattern).
  const canRequestPublish = Boolean(
    app && isConnected && !canCreate && app.creatorAccess === 'approval'
  );
  const createHref = `${APP_DROP_CREATE_PATH}?${MARKET_APP_PARAM}=${encodeURIComponent(appId)}`;
  const openDropCreate = useCallback(() => {
    router.push(createHref);
  }, [createHref, router]);
  const openPublishAccess = useCallback(() => {
    setPublishAccessOpen(true);
  }, []);
  useRegisterComposeAction(canCreate ? openDropCreate : null, 'drop');

  // No reset needed when ineligible — the pending pill only renders inside
  // the `canRequestPublish` branch, and the fetch below refreshes the flag
  // whenever eligibility returns.
  useEffect(() => {
    if (!canRequestPublish || !viewerAccountId || !app) return;
    let cancelled = false;
    void Promise.all([
      fetchMyStorePublishRequest(app.appId, viewerAccountId),
      fetchMyStorePublishDecision(app.appId, viewerAccountId),
    ]).then(([row, decision]) => {
      if (cancelled) return;
      const declined =
        row != null &&
        row.status === 'pending' &&
        decision != null &&
        isStorePublishRequestRejected(row, [decision]);
      setMyPublishPending(row?.status === 'pending' && !declined);
    });
    return () => {
      cancelled = true;
    };
  }, [canRequestPublish, viewerAccountId, app, publishAccessRefreshKey]);

  useEffect(() => {
    if (!viewerAccountId) return;
    let cancelled = false;
    void fetchOwnedScarcesPage(viewerAccountId)
      .then((page) => {
        if (cancelled) return;
        setFetchedOwned({
          key: holdKey,
          items: ownedItemsInHub(page.items, holdMatch),
        });
      })
      .catch(() => {
        /* Keep the vault peek — a failed owned fetch must not flash shop chrome. */
      });
    return () => {
      cancelled = true;
    };
  }, [viewerAccountId, holdKey, holdMatch]);

  const ownedInHub =
    fetchedOwned?.key === holdKey
      ? fetchedOwned.items
      : peekHeldHubItems(viewerAccountId, holdMatch);
  const holdsEditionInHub =
    ownedInHub.length > 0 ? true : viewerAccountId ? null : false;
  const useFirst = hubUseFirst({ holdsEditionInHub });
  const hubBackHref = hubPageBackHref({
    useFirst,
    viewerAccountId,
  });
  const vaultHref = viewerAccountId
    ? portfolioCollectiblesPath(viewerAccountId)
    : null;
  const heldIds = useMemo(() => heldCollectionIdSet(ownedInHub), [ownedInHub]);
  const heldRows = useMemo(
    () => groupHoldingsForRail(ownedInHub.map(toPortfolioHoldingPeek)),
    [ownedInHub]
  );
  const storeDrops = useMemo(
    () => drops.filter((drop) => !heldIds.has(drop.collectionId)),
    [drops, heldIds]
  );
  const groups = useMemo(
    () => groupSeriesDrops(storeDrops, nowMs),
    [nowMs, storeDrops]
  );
  const showSectionLabels = groups.length > 1;
  const heldKeys = useMemo(
    () => heldRows.map((row) => row.tokenId),
    [heldRows]
  );
  const heldListRef = useRef<HTMLDivElement | null>(null);
  const heldWindow = useFeedWindow({
    keys: heldKeys,
    hostRef: heldListRef,
    anchorQuery: CATALOG_ANCHOR_QUERY,
    estimate: 112,
  });
  const catalogShell = hubCatalogShell({
    hasCatalog: drops.length > 0,
    hasHeld: heldRows.length > 0,
    ssrMiss,
    clientSettled: catalogSettled,
  });

  const showSettingsGear =
    authority && (owner || app?.creatorAccess === 'approval');

  const loadMoreDrops = useCallback(() => {
    if (!dropsHasMore || dropsLoadingMore) return;
    const offset = dropsOffset;
    setDropsLoadingMore(true);
    setDropsLoadMoreFailed(false);
    void fetchCollectionsByAppPage(appId, { limit: 48, offset })
      .then((page) => {
        setDrops((current) => {
          const seen = new Set(current.map((drop) => drop.collectionId));
          const next = page.views.filter(
            (drop) => !seen.has(drop.collectionId)
          );
          return next.length > 0 ? [...current, ...next] : current;
        });
        setDropsOffset(offset + page.fetched);
        setDropsHasMore(page.fetched >= 48);
      })
      .catch(() => {
        setDropsLoadMoreFailed(true);
      })
      .finally(() => {
        setDropsLoadingMore(false);
      });
  }, [appId, dropsHasMore, dropsLoadingMore, dropsOffset]);

  useEffect(() => {
    if (!catalogSettled || storeDrops.length > 0) return;
    if (!dropsHasMore || dropsLoadingMore || dropsLoadMoreFailed || !app)
      return;
    const id = window.setTimeout(() => {
      loadMoreDrops();
    }, 0);
    return () => window.clearTimeout(id);
  }, [
    app,
    catalogSettled,
    dropsHasMore,
    dropsLoadMoreFailed,
    dropsLoadingMore,
    loadMoreDrops,
    storeDrops.length,
  ]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: dropsSentinelRef,
    enabled:
      dropsHasMore &&
      storeDrops.length > 0 &&
      !dropsLoadingMore &&
      !dropsLoadMoreFailed &&
      Boolean(app),
    onIntersect: loadMoreDrops,
  });

  if (notFound && !app) {
    return (
      <OsAppScreen title="Hub" dockBack backFallbackHref={hubBackHref}>
        <div className={MARKET_PAGE_CLASS}>
          <div className="market-page-empty">
            <p className="market-page-empty-copy">
              This hub isn&rsquo;t available.
            </p>
            <OsEmptyAction href={APP_APPS_PATH}>Browse hubs</OsEmptyAction>
          </div>
        </div>
      </OsAppScreen>
    );
  }

  if (!app) {
    if (hubRouteYieldsLoadingSkeleton(clientMounted)) {
      return null;
    }
    return (
      <OsAppScreen
        title="Hub"
        dockBack
        backFallbackHref={hubBackHref}
        immersiveHeader
      >
        <HubPageSkeleton />
      </OsAppScreen>
    );
  }

  const creatorCount = rosterIds.length;
  const bannerSrcSet = ipfsImgSrcSet(app.bannerUrl, SCARCE_HERO_WIDTHS);
  const logoSrcSet = ipfsImgSrcSet(app.mediaUrl, [128, 384]);
  const activityMeta =
    stats != null
      ? hubActivityMeta({
          dropsTotal: stats.dropsTotal,
          mintedTotal: stats.mintedTotal,
          uniqueHolders: stats.uniqueHolders,
          volumeNearLabel: appVolumeNearLabel(stats.salesVolumeYocto),
        })
      : '';

  return (
    <OsAppScreen
      title={app.title}
      dockBack
      backFallbackHref={hubBackHref}
      actions={
        showSettingsGear ? (
          <OsIconAction
            className={`guild-manage-menu-trigger${
              canReviewRequests && pendingPublishCount > 0 ? ' has-badge' : ''
            }`}
            ariaLabel={
              canReviewRequests && pendingPublishCount > 0
                ? `Hub settings, ${pendingPublishCount} publish requests`
                : 'Hub settings'
            }
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon
              className="glass-sheet-close-icon guild-manage-menu-icon"
              aria-hidden
            />
            {canReviewRequests && pendingPublishCount > 0 ? (
              <span className="guild-manage-menu-badge" aria-hidden>
                {formatProfileCount(pendingPublishCount)}
              </span>
            ) : null}
          </OsIconAction>
        ) : undefined
      }
      immersiveHeader
      scrollRootRef={scrollRootRef}
    >
      <div aria-hidden className="os-chrome-glass" />
      <div
        className={osChromePageClassName(
          'app-page',
          useFirst && 'is-use-first'
        )}
        data-hub-use-first={useFirst ? '' : undefined}
        data-hub-back={hubBackHref}
      >
        <section className="app-page-hero" aria-label="Hub profile">
          <div
            className={`app-hub-cover${
              app.bannerUrl ? '' : ' guild-hero-cover--fallback'
            }`}
            style={guildCoverStyle(app.bannerUrl, app.appId)}
            aria-hidden
          >
            {app.bannerUrl ? (
              <img
                src={app.bannerUrl}
                srcSet={bannerSrcSet}
                sizes={bannerSrcSet ? APP_COLUMN_HERO_SIZES : undefined}
                alt=""
                decoding="async"
              />
            ) : null}
          </div>

          <header className="app-page-head app-page-head--overlap">
            <span
              className={`app-page-logo${app.mediaUrl ? ' has-media' : ''}`}
              aria-hidden
            >
              {app.mediaUrl ? (
                <img
                  src={app.mediaUrl}
                  srcSet={logoSrcSet}
                  sizes={logoSrcSet ? '80px' : undefined}
                  alt=""
                  decoding="async"
                />
              ) : (
                <span className="app-page-monogram">{monogram(app.title)}</span>
              )}
            </span>
            <div className="app-page-headings">
              <h2 className="app-page-title" ref={heroTitleRef}>
                {app.title}
              </h2>
              <Link
                href={portfolioPath(app.ownerId)}
                scroll={false}
                className="app-page-owner"
              >
                by {displayName(app.ownerId)}
              </Link>
            </div>
          </header>

          {/* Same anatomy as guild-hero-meta: facepile + mode, Request
              opposite (guild Join / Request). Categories on tags row. */}
          <div className="guild-hero-meta">
            <div className="guild-hero-meta-main">
              <GuildFacepile
                memberIds={rosterIds}
                profiles={rosterProfiles}
                memberCount={creatorCount}
                countUnit={{ one: 'creator', other: 'creators' }}
                onClick={() => setCreatorsOpen(true)}
              />
              <span className="guild-hero-mode-row">
                <span className="guild-hero-mode">
                  {creatorAccessShort(app.creatorAccess)}
                </span>
                <button
                  type="button"
                  className="guild-hero-facts-button"
                  aria-label="Hub facts"
                  onClick={() => setFactsOpen(true)}
                >
                  <InformationCircleIcon
                    className="guild-hero-facts-icon"
                    aria-hidden
                  />
                </button>
              </span>
            </div>
            {canRequestPublish ? (
              <div className="guild-hero-membership-slot">
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  size="sm"
                  borderless
                  className="guild-hero-membership hub-hero-publish-request"
                >
                  <OsSheetAction
                    type="button"
                    className="guild-hero-action"
                    variant="primary"
                    ready
                    onClick={openPublishAccess}
                  >
                    {myPublishPending ? 'Pending' : 'Request'}
                  </OsSheetAction>
                </OsSheetActions>
              </div>
            ) : null}
          </div>

          {app.categories.length > 0 ? (
            <div className="guild-hero-tags" aria-label="Hub categories">
              {app.categories.map((category) => (
                <span key={category}>
                  {hubCategoryLabel(category) ?? category}
                </span>
              ))}
            </div>
          ) : null}

          {activityMeta && !useFirst ? (
            <p className="series-hero-meta" aria-label="Hub activity">
              {activityMeta}
            </p>
          ) : null}

          {app.description ? (
            <GuildDescriptionClamp text={app.description} />
          ) : null}

          {useFirst && vaultHref ? (
            <div className="series-use-actions">
              <OsRowAction href={vaultHref}>Open Collectibles</OsRowAction>
            </div>
          ) : null}
        </section>

        {catalogShell === 'skeleton' &&
        !hubRouteYieldsLoadingSkeleton(clientMounted) ? (
          <HubPageSkeleton listOnly />
        ) : null}

        {catalogShell === 'ready' && heldRows.length > 0 ? (
          <div
            ref={heldListRef}
            className="series-held-list market-listing-list"
            role="list"
          >
            {heldWindow.windowed && heldWindow.topSpacer > 0 ? (
              <div
                style={{ height: heldWindow.topSpacer }}
                aria-hidden="true"
                data-feed-window-spacer="top"
              />
            ) : null}
            {heldRows.slice(heldWindow.start, heldWindow.end).map((item) => (
              <div
                key={item.tokenId}
                ref={heldWindow.registerRow(item.tokenId)}
                data-catalog-key={item.tokenId}
              >
                <CollectiblesHoldingRow
                  item={item}
                  editionCount={item.editionCount}
                  hideCreator
                  onOpenEditions={
                    item.editionCount > 1
                      ? () =>
                          setEditionPick({
                            title: item.title,
                            editions: item.editions.map(ownedScarceFromPeek),
                          })
                      : undefined
                  }
                />
              </div>
            ))}
            {heldWindow.windowed && heldWindow.bottomSpacer > 0 ? (
              <div
                style={{ height: heldWindow.bottomSpacer }}
                aria-hidden="true"
                data-feed-window-spacer="bottom"
              />
            ) : null}
          </div>
        ) : null}

        {catalogShell === 'ready' && storeDrops.length > 0 ? (
          <>
            {heldRows.length > 0 ? (
              <Divider variant="item" className="series-hero-divider" />
            ) : null}
            <div className="series-catalog">
              {groups.map((group) => (
                <section
                  key={group.bucket}
                  className="series-catalog-section"
                  aria-label={group.label}
                >
                  {showSectionLabels ? (
                    <p className="collection-section-label">{group.label}</p>
                  ) : null}
                  <SeriesShopGroupList
                    drops={group.drops}
                    nowMs={nowMs}
                    showCreator
                  />
                </section>
              ))}
            </div>
            {dropsLoadingMore ? (
              <MarketListSkeleton rows={2} variant="drops" />
            ) : null}
            {dropsLoadMoreFailed ? (
              <OsChromeListAlert
                message="Couldn’t load more."
                retryLabel="Retry"
                onRetry={loadMoreDrops}
              />
            ) : null}
            {dropsHasMore && !dropsLoadMoreFailed ? (
              <div
                ref={dropsSentinelRef}
                className="standing-panel-sentinel"
                aria-hidden
              />
            ) : null}
          </>
        ) : null}

        {catalogShell === 'ready' &&
        storeDrops.length === 0 &&
        dropsLoadMoreFailed ? (
          <OsChromeListAlert
            message="Couldn’t load more."
            retryLabel="Retry"
            onRetry={loadMoreDrops}
          />
        ) : null}

        {(catalogShell === 'ready' || catalogShell === 'empty') &&
        storeDrops.length === 0 &&
        dropsHasMore &&
        !dropsLoadMoreFailed ? (
          <MarketListSkeleton rows={2} variant="drops" />
        ) : null}

        {catalogShell === 'empty' && !dropsHasMore ? (
          <div className="standing-panel-empty-block is-centered">
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">
                No drops in this hub yet.
              </p>
              {canCreate ? (
                <>
                  <p className="standing-panel-empty-secondary">
                    Start the next drop here from Create.
                  </p>
                  <OsEmptyAction
                    href={createHref}
                    className="series-empty-create"
                  >
                    Create a drop
                  </OsEmptyAction>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {canRequestPublish ? (
        <HubPublishAccessSheet
          open={publishAccessOpen}
          appId={app.appId}
          onClose={() => setPublishAccessOpen(false)}
          onChanged={() => setPublishAccessRefreshKey((k) => k + 1)}
        />
      ) : null}

      {factsOpen ? (
        <HubFactsSheet
          open
          onClose={() => setFactsOpen(false)}
          app={app}
          stats={stats}
          onOpenCreators={() => setCreatorsOpen(true)}
          onHandoffCreators={() => {
            setSheetHandoff(true);
            setFactsOpen(false);
            setCreatorsOpen(true);
          }}
        />
      ) : null}

      <SheetHandoffProvider active={sheetHandoff}>
        {creatorsOpen ? (
          <HubCreatorsSheet
            open
            onClose={() => {
              setSheetHandoff(false);
              setCreatorsOpen(false);
            }}
            app={app}
          />
        ) : null}
      </SheetHandoffProvider>

      {showSettingsGear && settingsOpen ? (
        <HubSettingsSheet
          open
          hubName={app.title}
          showOwnerTools={owner}
          showPeople={authority && (owner || app.creatorAccess === 'approval')}
          showPublishRequests={canReviewRequests}
          publishRequestCount={pendingPublishCount}
          onClose={() => setSettingsOpen(false)}
          onOpenSheet={() => undefined}
          onHandoff={(sheet) => {
            setSheetHandoff(sheet === 'publish-requests');
            setSettingsOpen(false);
            setManageSheet(sheet);
          }}
        />
      ) : null}

      {owner ? (
        <HubLookSheet
          open={manageSheet === 'look'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
        />
      ) : null}

      {owner ? (
        <HubAccessSheet
          open={manageSheet === 'access'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
        />
      ) : null}

      {authority && (owner || app.creatorAccess === 'approval') ? (
        <HubPeopleSheet
          open={manageSheet === 'people'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
          canManageCreators={authority}
          canManageModerators={owner}
        />
      ) : null}

      {canReviewRequests ? (
        <SheetHandoffProvider active={sheetHandoff}>
          <HubPublishRequestsSheet
            open={manageSheet === 'publish-requests'}
            appId={app.appId}
            approvedCreatorIds={app.approvedCreators}
            onClose={() => {
              setSheetHandoff(false);
              setManageSheet(null);
            }}
            onChanged={onManaged}
          />
        </SheetHandoffProvider>
      ) : null}

      {owner ? (
        <HubTransferSheet
          open={manageSheet === 'transfer'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
        />
      ) : null}
      <HeldEditionFollow
        open={editionPick != null}
        title={editionPick?.title ?? ''}
        editions={editionPick?.editions ?? []}
        onClose={() => setEditionPick(null)}
      />
    </OsAppScreen>
  );
}
