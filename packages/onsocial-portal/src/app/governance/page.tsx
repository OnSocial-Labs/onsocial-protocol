'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { useWallet } from '@/contexts/wallet-context';
import {
  GovernanceCardSkeletonList,
  GovernancePageLoadingShell,
} from '@/features/governance/governance-page-loading-shell';
import { GovernancePageIntro } from '@/features/governance/governance-page-intro';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  applyGovernanceFeedApplications,
  fetchDaoProposal,
  fetchGovernanceFeed,
  fetchGovernanceFeedBootstrap,
  readGovernanceFeedCache,
} from '@/features/governance/api';
import {
  ensureGovernanceProposalEventSource,
  subscribeGovernanceProposalUpdates,
} from '@/features/governance/governance-proposal-events-client';
import {
  appendGovernanceDaoBoardParam,
  GOVERNANCE_DAO_BOARD_OPTIONS,
  GOVERNANCE_DAO_BOARD_PARAM,
  getLaneOptionsForBoard,
  normalizeLaneForBoard,
  parseGovernanceDaoBoard,
  resolveGovernanceDaoAccountId,
  type GovernanceDaoBoard,
} from '@/features/governance/governance-dao-board';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import { GovernanceCard } from '@/features/governance/governance-card';
import { GovernanceFeedLoadMore } from '@/features/governance/governance-feed-load-more';
import { GovernanceRail } from '@/features/governance/governance-rail';
import {
  buildGovernanceFeedItems,
  filterGovernanceItems,
  getGovernanceFeedEmptyState,
  getStatusCounts,
  getVisibleGovernanceBatch,
  getVisibleStatusOptions,
  GOVERNANCE_PAGE_SIZE,
  parseLane,
  parseStatusFilter,
  patchGovernanceFeedApplicationSnapshot,
} from '@/features/governance/page-utils';
import type { Application } from '@/features/governance/types';
import type {
  GovernanceLane,
  GovernanceStatusFilter,
} from '@/features/governance/page-utils';

function GovernancePageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { accountId } = useWallet();
  const [activeBoard, setActiveBoard] = useState<GovernanceDaoBoard>(() =>
    parseGovernanceDaoBoard(searchParams.get(GOVERNANCE_DAO_BOARD_PARAM))
  );
  const daoAccountId = resolveGovernanceDaoAccountId(activeBoard);
  const laneOptions = getLaneOptionsForBoard(activeBoard);
  const [apps, setApps] = useState<Application[]>([]);
  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [proposalPeriodNs, setProposalPeriodNs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeLane, setActiveLane] = useState<GovernanceLane>(() =>
    normalizeLaneForBoard(
      parseGovernanceDaoBoard(searchParams.get(GOVERNANCE_DAO_BOARD_PARAM)),
      parseLane(searchParams.get('lane'))
    )
  );
  const [statusFilter, setStatusFilter] = useState<GovernanceStatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'))
  );
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? ''
  );
  const [visibleCount, setVisibleCount] = useState(GOVERNANCE_PAGE_SIZE);
  const isInitialLoading = loading && apps.length === 0 && !error;
  const cardListRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const [contentKey, setContentKey] = useState(0);

  // Sync state → URL without triggering Next.js re-renders
  const syncUrlRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (syncUrlRef.current) clearTimeout(syncUrlRef.current);
    syncUrlRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      appendGovernanceDaoBoardParam(params, activeBoard);
      if (activeLane !== 'all') params.set('lane', activeLane);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) params.set('q', trimmedQuery);

      const nextUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;

      if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, '', nextUrl);
      }
    }, 0);
    return () => {
      if (syncUrlRef.current) clearTimeout(syncUrlRef.current);
    };
  }, [activeBoard, activeLane, pathname, searchQuery, statusFilter]);

  const hasLoadedApps = useRef(false);

  const applyFeed = useCallback(
    (
      bootstrapApps: Application[],
      feed: {
        applications: Application[];
        daoPolicy: GovernanceDaoPolicy | null;
      }
    ) => {
      const mergedApps = applyGovernanceFeedApplications(
        bootstrapApps,
        feed.applications
      );
      setApps(mergedApps);
      setDaoPolicy(feed.daoPolicy);
      setProposalPeriodNs(feed.daoPolicy?.proposal_period ?? null);
    },
    []
  );

  const loadApps = useCallback(async () => {
    const isRefresh = hasLoadedApps.current;
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    setError('');

    let bootstrapApps: Application[] = [];
    let showedInterimData = false;

    try {
      const cachedFeed = !isRefresh
        ? readGovernanceFeedCache(daoAccountId)
        : null;
      if (cachedFeed) {
        setApps(cachedFeed.applications);
        setDaoPolicy(cachedFeed.daoPolicy);
        setProposalPeriodNs(cachedFeed.daoPolicy?.proposal_period ?? null);
        setLoading(false);
        showedInterimData = true;
      } else if (!isRefresh) {
        const bootstrap = await fetchGovernanceFeedBootstrap(daoAccountId);
        if (bootstrap && bootstrap.applications.length > 0) {
          bootstrapApps = bootstrap.applications;
          setApps(bootstrapApps);
          setDaoPolicy(bootstrap.daoPolicy);
          setProposalPeriodNs(bootstrap.daoPolicy?.proposal_period ?? null);
          setLoading(false);
          showedInterimData = true;
        }
      }

      const feed = await fetchGovernanceFeed({
        daoAccountId,
        skipMemoryCache: isRefresh,
        onRevalidate: (freshFeed) => {
          applyFeed(bootstrapApps, freshFeed);
        },
      });
      applyFeed(bootstrapApps, feed);
      hasLoadedApps.current = true;
    } catch {
      if (!showedInterimData) setError('Failed to load governance queue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyFeed, daoAccountId]);

  useLayoutEffect(() => {
    const cachedFeed = readGovernanceFeedCache(daoAccountId);
    if (!cachedFeed) {
      return;
    }

    setApps(cachedFeed.applications);
    setDaoPolicy(cachedFeed.daoPolicy);
    setProposalPeriodNs(cachedFeed.daoPolicy?.proposal_period ?? null);
    setLoading(false);
  }, [daoAccountId]);

  useEffect(() => {
    hasLoadedApps.current = false;
    loadApps();
  }, [loadApps]);

  useEffect(() => {
    ensureGovernanceProposalEventSource(daoAccountId);

    return subscribeGovernanceProposalUpdates((proposalId) => {
      void fetchDaoProposal(proposalId, daoAccountId).then((snapshot) => {
        if (!snapshot) {
          return;
        }

        setApps((current) =>
          patchGovernanceFeedApplicationSnapshot(current, proposalId, snapshot)
        );
      });
    });
  }, [daoAccountId]);

  const feedItems = buildGovernanceFeedItems(apps, { proposalPeriodNs });
  const { laneItems, searchScopedLaneItems, filteredItems, normalizedQuery } =
    filterGovernanceItems({
      items: feedItems,
      lane: activeLane,
      statusFilter,
      searchQuery,
    });
  const { visibleItems, hasMore, shownCount } = getVisibleGovernanceBatch(
    filteredItems,
    visibleCount
  );
  const statusCounts = getStatusCounts(searchScopedLaneItems);
  const visibleStatusOptions = getVisibleStatusOptions(
    statusCounts,
    statusFilter
  );
  const trimmedSearchQuery = searchQuery.trim();
  const feedEmptyState = getGovernanceFeedEmptyState({
    statusFilter,
    lane: activeLane,
    searchQuery,
    treasuryBoardEmpty: activeBoard === 'treasury' && apps.length === 0,
  });
  const proposalLabel =
    activeBoard === 'treasury'
      ? 'treasury proposals'
      : activeLane === 'protocol'
        ? 'protocol proposals'
        : activeLane === 'partners'
          ? 'partner proposals'
          : 'governance proposals';
  const showProposalsSection = !error;
  const feedEndSummary =
    !hasMore && filteredItems.length > GOVERNANCE_PAGE_SIZE
      ? normalizedQuery
        ? `All ${filteredItems.length} ${filteredItems.length === 1 ? 'result' : 'results'}`
        : `All ${filteredItems.length} ${proposalLabel}`
      : null;

  const loadMore = useCallback(() => {
    setVisibleCount((count) =>
      Math.min(count + GOVERNANCE_PAGE_SIZE, filteredItems.length)
    );
  }, [filteredItems.length]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: '160px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, shownCount]);

  function resetVisibleBatch() {
    setVisibleCount(GOVERNANCE_PAGE_SIZE);
  }

  function handleBoardChange(nextBoard: GovernanceDaoBoard) {
    if (nextBoard === activeBoard) {
      return;
    }

    setActiveBoard(nextBoard);
    setActiveLane((lane) => normalizeLaneForBoard(nextBoard, lane));
    resetVisibleBatch();
    setContentKey((k) => k + 1);
    setApps([]);
    setDaoPolicy(null);
    setProposalPeriodNs(null);
    setLoading(true);
    setError('');
    hasLoadedApps.current = false;
  }

  function handleFilterChange(updater: () => void) {
    updater();
    resetVisibleBatch();
    setContentKey((k) => k + 1);
  }

  function handleSearchChange(query: string) {
    setSearchQuery(query);
    resetVisibleBatch();
  }

  function handleSearchSubmit() {
    // Enter dismisses the keyboard only — results already filter live as you type.
  }

  function handleClearSearch() {
    handleFilterChange(() => {
      setSearchQuery('');
    });
  }

  function handleClearStatus() {
    handleFilterChange(() => {
      setStatusFilter('all');
    });
  }

  return (
    <PageShell className="max-w-6xl">
      <GovernancePageIntro />

      {error && (
        <p className="portal-red-panel portal-red-text mb-5 rounded-[1rem] border px-4 py-3 text-center text-sm">
          {error}
        </p>
      )}

      {!showProposalsSection ? null : (
        <>
          <GovernanceRail
            activeBoard={activeBoard}
            boardOptions={GOVERNANCE_DAO_BOARD_OPTIONS}
            daoAccountId={daoAccountId}
            viewerAccountId={accountId}
            activeLane={activeLane}
            laneOptions={laneOptions}
            loading={loading || refreshing}
            onBoardChange={handleBoardChange}
            onLaneChange={(lane) => {
              handleFilterChange(() => setActiveLane(lane));
            }}
            onRefresh={loadApps}
            onSearchChange={handleSearchChange}
            onSearchSubmit={handleSearchSubmit}
            onStatusChange={(status) => {
              handleFilterChange(() => setStatusFilter(status));
            }}
            searchQuery={searchQuery}
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            visibleStatusOptions={visibleStatusOptions}
          />

          {!isInitialLoading && (
            <div
              ref={cardListRef}
              className="mb-4 flex items-center justify-between gap-3 px-1 text-sm text-muted-foreground"
            >
              <p>
                {normalizedQuery ? (
                  <>
                    <span className="text-foreground">
                      {filteredItems.length}
                    </span>{' '}
                    {filteredItems.length === 1 ? 'result' : 'results'} for{' '}
                    <span className="text-foreground">
                      &ldquo;{trimmedSearchQuery}&rdquo;
                    </span>
                    <span className="text-muted-foreground/70">
                      {' '}
                      · {laneItems.length} total
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-foreground">
                      {filteredItems.length}
                    </span>{' '}
                    {proposalLabel}
                  </>
                )}
              </p>
              {(statusFilter !== 'all' || normalizedQuery) && (
                <div className="flex shrink-0 items-center gap-3">
                  {normalizedQuery ? (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear search
                    </button>
                  ) : null}
                  {statusFilter !== 'all' ? (
                    <button
                      type="button"
                      onClick={handleClearStatus}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear status
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {isInitialLoading ? (
            <GovernanceCardSkeletonList count={3} />
          ) : filteredItems.length === 0 ? (
            <SurfacePanel
              radius="xl"
              tone="soft"
              className="px-6 py-12 text-center"
            >
              <p className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                {feedEmptyState.title}
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                {feedEmptyState.detail}
              </p>
              {normalizedQuery ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleClearSearch}
                >
                  Clear search
                </Button>
              ) : null}
            </SurfacePanel>
          ) : (
            <div
              key={contentKey}
              className="space-y-4 animate-in fade-in duration-200"
            >
              {visibleItems.map((item) => (
                <GovernanceCard
                  key={`${item.app.app_id}-${item.app.governance_proposal?.proposal_id ?? 'db'}`}
                  app={item.app}
                  feedDaoPolicy={daoPolicy}
                  onGovernanceUpdated={loadApps}
                />
              ))}

              <GovernanceFeedLoadMore
                hasMore={hasMore}
                onLoadMore={loadMore}
                loadMoreSentinelRef={loadMoreSentinelRef}
                endSummary={feedEndSummary}
              />
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

export default function GovernancePage() {
  return (
    <Suspense fallback={<GovernancePageLoadingShell cardCount={3} />}>
      <GovernancePageContent />
    </Suspense>
  );
}
