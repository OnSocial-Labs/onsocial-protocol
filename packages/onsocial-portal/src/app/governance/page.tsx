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
import {
  GovernanceCardSkeletonList,
  GovernancePageLoadingShell,
} from '@/features/governance/governance-page-loading-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
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
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import { GovernanceCard } from '@/features/governance/governance-card';
import { GovernanceRail } from '@/features/governance/governance-rail';
import {
  buildGovernanceFeedItems,
  filterGovernanceItems,
  getFilteredEmptyState,
  getPaginatedItems,
  getStatusCounts,
  getVisibleStatusOptions,
  GOVERNANCE_PAGE_SIZE,
  LANE_OPTIONS,
  parseLane,
  parsePage,
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
  const [apps, setApps] = useState<Application[]>([]);
  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [proposalPeriodNs, setProposalPeriodNs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeLane, setActiveLane] = useState<GovernanceLane>(() =>
    parseLane(searchParams.get('lane'))
  );
  const [statusFilter, setStatusFilter] = useState<GovernanceStatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'))
  );
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? ''
  );
  const [currentPage, setCurrentPage] = useState(() =>
    parsePage(searchParams.get('page'))
  );
  const isInitialLoading = loading && apps.length === 0 && !error;
  const cardListRef = useRef<HTMLDivElement>(null);
  const [contentKey, setContentKey] = useState(0);

  // Sync state → URL without triggering Next.js re-renders
  const syncUrlRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (syncUrlRef.current) clearTimeout(syncUrlRef.current);
    syncUrlRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (activeLane !== 'all') params.set('lane', activeLane);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) params.set('q', trimmedQuery);
      if (currentPage > 1) params.set('page', String(currentPage));

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
  }, [activeLane, currentPage, pathname, searchQuery, statusFilter]);

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
      const cachedFeed = !isRefresh ? readGovernanceFeedCache() : null;
      if (cachedFeed) {
        setApps(cachedFeed.applications);
        setDaoPolicy(cachedFeed.daoPolicy);
        setProposalPeriodNs(cachedFeed.daoPolicy?.proposal_period ?? null);
        setLoading(false);
        showedInterimData = true;
      } else if (!isRefresh) {
        const bootstrap = await fetchGovernanceFeedBootstrap();
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
  }, [applyFeed]);

  useLayoutEffect(() => {
    const cachedFeed = readGovernanceFeedCache();
    if (!cachedFeed) {
      return;
    }

    setApps(cachedFeed.applications);
    setDaoPolicy(cachedFeed.daoPolicy);
    setProposalPeriodNs(cachedFeed.daoPolicy?.proposal_period ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  useEffect(() => {
    ensureGovernanceProposalEventSource(GOVERNANCE_DAO_ACCOUNT);

    return subscribeGovernanceProposalUpdates((proposalId) => {
      void fetchDaoProposal(proposalId, GOVERNANCE_DAO_ACCOUNT).then(
        (snapshot) => {
          if (!snapshot) {
            return;
          }

          setApps((current) =>
            patchGovernanceFeedApplicationSnapshot(
              current,
              proposalId,
              snapshot
            )
          );
        }
      );
    });
  }, []);

  const feedItems = buildGovernanceFeedItems(apps, { proposalPeriodNs });
  const { laneItems, filteredItems, normalizedQuery } = filterGovernanceItems({
    items: feedItems,
    lane: activeLane,
    statusFilter,
    searchQuery,
  });
  const statusCounts = getStatusCounts(laneItems);
  const visibleStatusOptions = getVisibleStatusOptions(
    statusCounts,
    statusFilter
  );
  const { totalPages, safeCurrentPage, paginatedItems } = getPaginatedItems({
    items: filteredItems,
    currentPage,
    pageSize: GOVERNANCE_PAGE_SIZE,
  });
  const emptyState = getFilteredEmptyState(statusFilter, activeLane);
  const proposalLabel =
    activeLane === 'protocol'
      ? 'protocol proposals'
      : activeLane === 'partners'
        ? 'partner proposals'
        : 'governance proposals';

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  function handleFilterChange(updater: () => void) {
    updater();
    setCurrentPage(1);
    setContentKey((k) => k + 1);
  }

  function handlePageChange(updater: () => void) {
    updater();
    setContentKey((k) => k + 1);
    requestAnimationFrame(() => {
      cardListRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  return (
    <PageShell className="max-w-6xl">
      <SecondaryPageHeader
        badge="Governance"
        badgeAccent="blue"
        glowAccents={['blue', 'green']}
        glowClassName="h-56 opacity-80"
        title="Communities that govern in public"
        description="Review proposals, track guardians, and follow launches as decisions move on-chain."
      />

      {error && (
        <p className="portal-red-panel portal-red-text mb-5 rounded-[1rem] border px-4 py-3 text-center text-sm">
          {error}
        </p>
      )}

      {!loading && !error && apps.length === 0 && (
        <SurfacePanel
          radius="xl"
          tone="soft"
          className="py-12 text-center text-muted-foreground"
        >
          No governance items right now.
        </SurfacePanel>
      )}
      {(apps.length > 0 || isInitialLoading) && (
        <>
          <SectionHeader
            badge="Proposals"
            className="flex-row items-center justify-between gap-3 md:items-end"
            contentClassName="flex-1"
          />

          <GovernanceRail
            activeLane={activeLane}
            laneOptions={LANE_OPTIONS}
            loading={loading || refreshing}
            onLaneChange={(lane) => {
              handleFilterChange(() => setActiveLane(lane));
            }}
            onRefresh={loadApps}
            onSearchChange={(query) => {
              setSearchQuery(query);
              setCurrentPage(1);
            }}
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
                Showing{' '}
                <span className="text-foreground">{filteredItems.length}</span>{' '}
                of <span className="text-foreground">{laneItems.length}</span>{' '}
                {proposalLabel}
              </p>
              {(statusFilter !== 'all' || normalizedQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    handleFilterChange(() => {
                      setStatusFilter('all');
                      setSearchQuery('');
                    });
                  }}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear filters
                </button>
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
                {emptyState.title}
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                {emptyState.detail}
              </p>
            </SurfacePanel>
          ) : (
            <div
              key={contentKey}
              className="space-y-4 animate-in fade-in duration-200"
            >
              {paginatedItems.map((item) => (
                <GovernanceCard
                  key={`${item.app.app_id}-${item.app.governance_proposal?.proposal_id ?? 'db'}`}
                  app={item.app}
                  feedDaoPolicy={daoPolicy}
                  onGovernanceUpdated={loadApps}
                />
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 px-1 pt-2 text-sm text-muted-foreground">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handlePageChange(() =>
                        setCurrentPage((page) => Math.max(page - 1, 1))
                      );
                    }}
                    disabled={safeCurrentPage === 1}
                  >
                    Previous
                  </Button>
                  <p>
                    Page{' '}
                    <span className="text-foreground">{safeCurrentPage}</span>{' '}
                    of <span className="text-foreground">{totalPages}</span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handlePageChange(() =>
                        setCurrentPage((page) => Math.min(page + 1, totalPages))
                      );
                    }}
                    disabled={safeCurrentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
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
