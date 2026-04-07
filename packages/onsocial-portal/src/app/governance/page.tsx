'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { RouteLoadingShell } from '@/components/layout/route-loading-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { fetchDaoPolicy, fetchGovernanceFeed } from '@/features/governance/api';
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
  const [proposalPeriodNs, setProposalPeriodNs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  const loadApps = useCallback(async () => {
    if (!hasLoadedApps.current) setLoading(true);
    setError('');
    try {
      const [data, policy] = await Promise.all([
        fetchGovernanceFeed(),
        fetchDaoPolicy(),
      ]);
      setApps(data);
      setProposalPeriodNs(policy?.proposal_period ?? null);
      hasLoadedApps.current = true;
    } catch {
      if (!hasLoadedApps.current) setError('Failed to load governance queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

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
        badge="Public governance"
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
            loading={loading}
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
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <SurfacePanel
                  key={i}
                  radius="xl"
                  tone="solid"
                  borderTone="strong"
                  padding="roomy"
                  className="animate-pulse"
                >
                  <div className="h-4 w-2/5 rounded bg-muted-foreground/10" />
                  <div className="mt-3 h-3 w-3/4 rounded bg-muted-foreground/10" />
                  <div className="mt-6 h-3 w-1/2 rounded bg-muted-foreground/10" />
                </SurfacePanel>
              ))}
            </div>
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
    <Suspense
      fallback={
        <RouteLoadingShell
          size="wide"
          panelCount={2}
          panelMinHeights={['12rem', '18rem']}
          contentClassName="space-y-5"
        />
      }
    >
      <GovernancePageContent />
    </Suspense>
  );
}
