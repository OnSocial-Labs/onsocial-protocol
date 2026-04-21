'use client';

import { useEffect, useState } from 'react';
import { Activity, Database, Lock, RefreshCcw } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { useGatewayAuth } from '@/contexts/gateway-auth-context';
import { useWallet } from '@/contexts/wallet-context';
import {
  type AccountActivityBreakdown,
  fetchAnalyticsDrilldown,
  fetchAnalyticsOverview,
  type AnalyticsDrilldown,
  type AnalyticsDrilldownFocus,
  type AnalyticsDrilldownStream,
  type AnalyticsOverview,
  type LatestIndexedSummary,
  type PartitionActivityBreakdown,
} from '@/features/analytics/api';
import { portalColors } from '@/lib/portal-colors';

const DEFAULT_DRILLDOWN_LIMIT = 12;

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTimestamp(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return value;

  const millis = numeric > 1_000_000_000_000 ? numeric / 1_000_000 : numeric;
  return new Date(millis).toLocaleString();
}

function renderLatest(label: string, item: LatestIndexedSummary | null) {
  return (
    <div className="rounded-[1rem] border border-border/40 bg-background/40 p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-semibold text-foreground/85">
        {item ? `#${formatCount(item.blockHeight)}` : 'No data'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {item ? formatTimestamp(item.blockTimestamp) : 'No indexed rows yet'}
      </p>
    </div>
  );
}

function renderActorList(
  label: string,
  items: AccountActivityBreakdown[],
  emptyLabel: string,
  onSelect: (accountId: string) => void,
  selectedAccountId?: string
) {
  return (
    <SurfacePanel radius="xl" tone="soft" padding="roomy">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <button
              type="button"
              key={`${label}-${item.accountId}`}
              onClick={() => onSelect(item.accountId)}
              className="flex w-full items-center justify-between gap-4 rounded-[1rem] border border-border/35 bg-background/35 px-4 py-3 text-left transition-colors hover:border-border/60 hover:bg-background/50"
              style={
                selectedAccountId === item.accountId
                  ? { borderColor: portalColors.amber }
                  : undefined
              }
            >
              <span className="truncate font-mono text-sm text-foreground/85">
                {item.accountId}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCount(item.count)}
              </span>
            </button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </SurfacePanel>
  );
}

function renderPartitionList(
  items: PartitionActivityBreakdown[],
  onSelect: (partitionId: number) => void,
  selectedPartitionId?: number
) {
  return items.length > 0 ? (
    items.map((item) => (
      <button
        type="button"
        key={`partition-${item.partitionId}`}
        onClick={() => onSelect(item.partitionId)}
        className="flex w-full items-center justify-between gap-4 rounded-[1rem] border border-border/35 bg-background/35 px-4 py-3 text-left transition-colors hover:border-border/60 hover:bg-background/50"
        style={
          selectedPartitionId === item.partitionId
            ? { borderColor: portalColors.amber }
            : undefined
        }
      >
        <span className="font-mono text-sm text-foreground/85">
          partition {item.partitionId}
        </span>
        <span className="text-sm font-semibold text-muted-foreground">
          {formatCount(item.count)}
        </span>
      </button>
    ))
  ) : (
    <p className="text-sm text-muted-foreground">
      No sampled partition activity in the current window.
    </p>
  );
}

function renderDrilldownPanel(
  drilldown: AnalyticsDrilldown,
  isLoading: boolean,
  error: string | null,
  onClear: () => void,
  onStreamSelect: (stream: AnalyticsDrilldownStream) => void
) {
  const title =
    drilldown.focus.type === 'account'
      ? drilldown.focus.accountId
      : `partition ${drilldown.focus.partitionId}`;
  const streamOptions: AnalyticsDrilldownStream[] = [
    'all',
    'posts',
    'reactions',
    'claims',
    'groups',
    'permissions',
    'contracts',
  ];
  const latestCards = [
    ['Posts', drilldown.latestByStream.posts] as [
      string,
      LatestIndexedSummary | null,
    ],
    ['Reactions', drilldown.latestByStream.reactions] as [
      string,
      LatestIndexedSummary | null,
    ],
    ['Claims', drilldown.latestByStream.claims] as [
      string,
      LatestIndexedSummary | null,
    ],
    ['Groups', drilldown.latestByStream.groups] as [
      string,
      LatestIndexedSummary | null,
    ],
    ['Permissions', drilldown.latestByStream.permissions] as [
      string,
      LatestIndexedSummary | null,
    ],
    ['Contracts', drilldown.latestByStream.contracts] as [
      string,
      LatestIndexedSummary | null,
    ],
  ].filter(([, value]) => value != null || drilldown.stream === 'all');

  return (
    <SurfacePanel radius="xl" tone="soft" padding="roomy" className="mt-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Drilldown
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
            {title}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Latest indexed events and stream counts for the selected focus.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-border/50 px-4 py-2 text-sm font-medium transition-colors hover:border-border hover:bg-background/60"
        >
          Clear
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm" style={{ color: portalColors.amber }}>
          {error}
        </p>
      ) : null}

      <SurfacePanel radius="xl" tone="deep" padding="none" className="mt-6 overflow-hidden">
        <StatStrip columns={4} mobileColumns={2}>
          <StatStripCell label="Posts" value={formatCount(drilldown.totals.posts)} showDivider />
          <StatStripCell label="Reactions" value={formatCount(drilldown.totals.reactions)} showDivider />
          <StatStripCell label="Claims" value={formatCount(drilldown.totals.claims)} showDivider />
          <StatStripCell label="Groups" value={formatCount(drilldown.totals.groups)} />
        </StatStrip>
        <StatStrip columns={3} mobileColumns={1}>
          <StatStripCell label="Permissions" value={formatCount(drilldown.totals.permissions)} showDivider />
          <StatStripCell label="Contracts" value={formatCount(drilldown.totals.contracts)} showDivider />
          <StatStripCell label="Total" value={formatCount(drilldown.totals.total)} />
        </StatStrip>
      </SurfacePanel>

      <div className="mt-6 flex flex-wrap gap-2">
        {streamOptions.map((stream) => {
          const active = drilldown.stream === stream;
          return (
            <button
              key={stream}
              type="button"
              onClick={() => onStreamSelect(stream)}
              className="rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors hover:border-border hover:bg-background/60"
              style={
                active
                  ? {
                      borderColor: portalColors.amber,
                      color: portalColors.amber,
                    }
                  : undefined
              }
            >
              {stream}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {latestCards.map(([label, value]) => renderLatest(label, value))}
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Refreshing drilldown...</p>
        ) : drilldown.recent.length > 0 ? (
          drilldown.recent.map((event, index) => (
            <div
              key={`${event.stream}-${event.blockHeight}-${index}`}
              className="rounded-[1rem] border border-border/35 bg-background/35 px-4 py-3"
            >
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground/90">
                    {event.stream} · {event.label}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {event.actor}
                    {event.detail ? ` · ${event.detail}` : ''}
                    {event.operation ? ` · ${event.operation}` : ''}
                    {event.partitionId != null ? ` · partition ${event.partitionId}` : ''}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  #{formatCount(event.blockHeight)} · {formatTimestamp(event.blockTimestamp)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No recent indexed events for this focus.
          </p>
        )}
      </div>
    </SurfacePanel>
  );
}

export default function OpsAnalyticsPage() {
  const { accountId, connect, isConnected, isLoading: walletLoading } =
    useWallet();
  const { authError, ensureAuth, isAuthenticating, jwt } = useGatewayAuth();

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<AnalyticsDrilldownFocus | null>(null);
  const [selectedStream, setSelectedStream] = useState<AnalyticsDrilldownStream>('all');
  const [selectedLimit, setSelectedLimit] = useState(DEFAULT_DRILLDOWN_LIMIT);
  const [drilldown, setDrilldown] = useState<AnalyticsDrilldown | null>(null);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState(false);

  async function loadOverview(token: string) {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await fetchAnalyticsOverview(token);
      setOverview(data);
    } catch (err) {
      setOverview(null);
      setDrilldown(null);
      setSelectedFocus(null);
      setSelectedStream('all');
      setSelectedLimit(DEFAULT_DRILLDOWN_LIMIT);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsRefreshing(false);
    }
  }

  async function loadDrilldown(
    token: string,
    focus: AnalyticsDrilldownFocus,
    stream: AnalyticsDrilldownStream = 'all',
    limit = DEFAULT_DRILLDOWN_LIMIT
  ) {
    setSelectedFocus(focus);
    setSelectedStream(stream);
    setSelectedLimit(limit);
    setDrilldownError(null);
    setIsDrilldownLoading(true);
    try {
      const data = await fetchAnalyticsDrilldown(token, focus, stream, limit);
      setDrilldown(data);
    } catch (err) {
      setDrilldown(null);
      setDrilldownError(
        err instanceof Error ? err.message : 'Failed to load drilldown'
      );
    } finally {
      setIsDrilldownLoading(false);
    }
  }

  async function handleAuthenticate() {
    const token = await ensureAuth();
    if (token) {
      await loadOverview(token);
    }
  }

  useEffect(() => {
    if (!jwt) return;
    void loadOverview(jwt);
  }, [jwt]);

  function handleSelectAccount(accountId: string) {
    if (!jwt) return;
    void loadDrilldown(
      jwt,
      { type: 'account', accountId },
      'all',
      DEFAULT_DRILLDOWN_LIMIT
    );
  }

  function handleSelectPartition(partitionId: number) {
    if (!jwt) return;
    void loadDrilldown(
      jwt,
      { type: 'partition', partitionId },
      'all',
      DEFAULT_DRILLDOWN_LIMIT
    );
  }

  function handleSelectStream(stream: AnalyticsDrilldownStream) {
    if (!jwt || !selectedFocus) return;
    void loadDrilldown(jwt, selectedFocus, stream, DEFAULT_DRILLDOWN_LIMIT);
  }

  function handleLoadMore() {
    if (!jwt || !selectedFocus || !drilldown?.hasMore) return;
    void loadDrilldown(
      jwt,
      selectedFocus,
      selectedStream,
      selectedLimit + DEFAULT_DRILLDOWN_LIMIT
    );
  }

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Internal"
        badgeAccent="amber"
        glowAccents={['amber', 'blue']}
        title="Protocol analytics"
        description="Internal overview of indexed protocol volume, recent write activity, and the latest blocks flowing through the graph layer."
      />

      <SurfacePanel radius="xl" tone="soft" padding="roomy" className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Access
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
              Admin-gated gateway view
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              This page reads from the new gateway analytics endpoint and only resolves for admin or service-tier identities.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!isConnected ? (
              <button
                type="button"
                onClick={() => void connect()}
                className="rounded-full border border-border/50 px-4 py-2 text-sm font-medium transition-colors hover:border-border hover:bg-background/60"
                disabled={walletLoading}
              >
                {walletLoading ? 'Checking wallet...' : 'Connect wallet'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleAuthenticate()}
                className="rounded-full px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
                style={{ backgroundColor: portalColors.amber }}
                disabled={isAuthenticating || isRefreshing}
              >
                {isAuthenticating
                  ? 'Authenticating...'
                  : isRefreshing
                    ? 'Refreshing...'
                    : jwt
                      ? 'Refresh overview'
                      : 'Authenticate'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="rounded-full border border-border/40 px-3 py-1.5">
            Wallet: {accountId ?? 'not connected'}
          </span>
          <span className="rounded-full border border-border/40 px-3 py-1.5">
            Window: last 24 hours
          </span>
        </div>

        {authError ? (
          <p className="mt-4 text-sm" style={{ color: portalColors.amber }}>
            {authError}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm" style={{ color: portalColors.amber }}>
            {error}
          </p>
        ) : null}
      </SurfacePanel>

      {overview ? (
        <>
          <SectionHeader badge="Network Footprint" className="mb-4" />
          <SurfacePanel radius="xl" tone="soft" padding="none" className="mb-6 overflow-hidden">
            <StatStrip columns={5} mobileColumns={2}>
              <StatStripCell label="Profiles" value={formatCount(overview.totals.profiles)} showDivider />
              <StatStripCell label="Posts" value={formatCount(overview.totals.posts)} showDivider />
              <StatStripCell label="Reactions" value={formatCount(overview.totals.reactions)} showDivider />
              <StatStripCell label="Claims" value={formatCount(overview.totals.claims)} showDivider />
              <StatStripCell label="Groups" value={formatCount(overview.totals.groups)} />
            </StatStrip>
          </SurfacePanel>

          <SectionHeader badge="Recent Activity" className="mb-4" />
          <SurfacePanel radius="xl" tone="soft" padding="none" className="mb-6 overflow-hidden">
            <StatStrip columns={4} mobileColumns={2}>
              <StatStripCell label="New Profiles" value={formatCount(overview.recent24h.profiles)} icon={Lock} showDivider />
              <StatStripCell label="Posts" value={formatCount(overview.recent24h.posts)} icon={Activity} showDivider />
              <StatStripCell label="Reactions" value={formatCount(overview.recent24h.reactions)} icon={RefreshCcw} showDivider />
              <StatStripCell label="Groups" value={formatCount(overview.recent24h.groups)} icon={Database} />
            </StatStrip>
            <StatStrip columns={4} mobileColumns={2}>
              <StatStripCell label="Claims" value={formatCount(overview.recent24h.claims)} showDivider />
              <StatStripCell label="Permissions" value={formatCount(overview.recent24h.permissionChanges)} showDivider />
              <StatStripCell label="Storage" value={formatCount(overview.recent24h.storageWrites)} showDivider />
              <StatStripCell label="Contracts" value={formatCount(overview.recent24h.contractEvents)} />
            </StatStrip>
          </SurfacePanel>

          <SectionHeader badge="Latest Indexed Blocks" className="mb-4" />
          <div className="grid gap-4 md:grid-cols-3">
            {renderLatest('Posts', overview.latestIndexed.posts)}
            {renderLatest('Reactions', overview.latestIndexed.reactions)}
            {renderLatest('Groups', overview.latestIndexed.groups)}
          </div>

          <SectionHeader badge="Recent Actor Samples" className="mb-4 mt-8" />
          <div className="grid gap-4 md:grid-cols-2">
            {renderActorList(
              'Top post authors',
              overview.breakdowns.topPostAuthors,
              'No recent posts in the current sample window.',
              handleSelectAccount,
              selectedFocus?.type === 'account' ? selectedFocus.accountId : undefined
            )}
            {renderActorList(
              'Top reaction authors',
              overview.breakdowns.topReactionAuthors,
              'No recent reactions in the current sample window.',
              handleSelectAccount,
              selectedFocus?.type === 'account' ? selectedFocus.accountId : undefined
            )}
            {renderActorList(
              'Top claim issuers',
              overview.breakdowns.topClaimIssuers,
              'No recent claims in the current sample window.',
              handleSelectAccount,
              selectedFocus?.type === 'account' ? selectedFocus.accountId : undefined
            )}
            {renderActorList(
              'Top group authors',
              overview.breakdowns.topGroupAuthors,
              'No recent group updates in the current sample window.',
              handleSelectAccount,
              selectedFocus?.type === 'account' ? selectedFocus.accountId : undefined
            )}
          </div>

          <SectionHeader badge="Partition Heat" className="mb-4 mt-8" />
          <SurfacePanel radius="xl" tone="soft" padding="roomy">
            <p className="text-sm text-muted-foreground">
              Ranked from the latest {formatCount(overview.sampleLimit)} rows sampled per indexed stream over the last {overview.windowHours} hours.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {renderPartitionList(
                overview.breakdowns.topPartitions,
                handleSelectPartition,
                selectedFocus?.type === 'partition'
                  ? selectedFocus.partitionId
                  : undefined
              )}
            </div>
          </SurfacePanel>

          {drilldown || drilldownError ?
            renderDrilldownPanel(
              drilldown ?? {
                generatedAt: new Date().toISOString(),
                windowHours: overview.windowHours,
                focus: selectedFocus ?? { type: 'account', accountId: 'unknown' },
                stream: selectedStream,
                requestedLimit: selectedLimit,
                hasMore: false,
                totals: {
                  posts: 0,
                  reactions: 0,
                  claims: 0,
                  groups: 0,
                  permissions: 0,
                  contracts: 0,
                  total: 0,
                },
                latestByStream: {
                  posts: null,
                  reactions: null,
                  claims: null,
                  groups: null,
                  permissions: null,
                  contracts: null,
                },
                recent: [],
              },
              isDrilldownLoading,
              drilldownError,
              () => {
                setSelectedFocus(null);
                setSelectedStream('all');
                setSelectedLimit(DEFAULT_DRILLDOWN_LIMIT);
                setDrilldown(null);
                setDrilldownError(null);
              },
              handleSelectStream
            )
          : null}

          {drilldown?.hasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isDrilldownLoading}
                className="rounded-full border border-border/50 px-4 py-2 text-sm font-medium transition-colors hover:border-border hover:bg-background/60 disabled:opacity-60"
              >
                {isDrilldownLoading
                  ? 'Loading more...'
                  : `Load ${DEFAULT_DRILLDOWN_LIMIT} more`}
              </button>
            </div>
          ) : null}

          <p className="mt-6 text-sm text-muted-foreground">
            Snapshot generated at {new Date(overview.generatedAt).toLocaleString()}.
          </p>
        </>
      ) : (
        <SurfacePanel radius="xl" tone="deep" padding="roomy">
          <p className="text-sm text-muted-foreground">
            {isRefreshing
              ? 'Loading analytics overview...'
              : 'Authenticate with an internal wallet to load the analytics snapshot.'}
          </p>
        </SurfacePanel>
      )}
    </PageShell>
  );
}