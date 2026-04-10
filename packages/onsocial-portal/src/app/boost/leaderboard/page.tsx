'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Crown,
  Lock,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button, buttonArrowLeftClass } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  BOOST_CONTRACT,
  viewContractAt,
  type BoostStats,
} from '@/lib/near-rpc';
import {
  fetchCompositeBoard,
  fetchInfluenceBoard,
  fetchCommitmentBoard,
  fetchEarnerBoard,
  formatCompositeScore,
  formatSocialCompact,
  truncateAccountId,
  commitmentLabel,
  commitmentAccent,
  type BoosterEntry,
  type CompositeEntry,
  type EarnerEntry,
} from '@/lib/leaderboard';
import { cn } from '@/lib/utils';

// ─── Track Definitions ──────────────────────────────────────────
type TrackId = 'influence' | 'commitment' | 'composite' | 'earners';

const TRACKS: {
  id: TrackId;
  label: string;
  icon: typeof Crown;
  accent: 'purple' | 'blue' | 'amber' | 'green';
}[] = [
  { id: 'influence', label: 'Influence', icon: Crown, accent: 'purple' },
  { id: 'commitment', label: 'Commitment', icon: Lock, accent: 'blue' },
  { id: 'composite', label: 'Composite', icon: Sparkles, accent: 'amber' },
  { id: 'earners', label: 'Earners', icon: TrendingUp, accent: 'green' },
];

// ─── Rank row ────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/40 bg-background/30 font-mono text-xs text-muted-foreground">
      {rank}
    </span>
  );
}

function InfluenceRow({ entry, rank }: { entry: BoosterEntry; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-foreground">
          {truncateAccountId(entry.accountId, 28)}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <PortalBadge accent={commitmentAccent(entry.lockMonths)} size="xs">
            {commitmentLabel(entry.lockMonths)}
          </PortalBadge>
          <span className="text-[11px] text-muted-foreground">
            {entry.lockMonths}mo lock
          </span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-[-0.02em]">
          {formatSocialCompact(entry.effectiveBoost)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Influence
        </p>
      </div>
    </div>
  );
}

function CommitmentRow({ entry, rank }: { entry: BoosterEntry; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-foreground">
          {truncateAccountId(entry.accountId, 28)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <PortalBadge accent={commitmentAccent(entry.lockMonths)} size="xs">
          {entry.lockMonths}mo
        </PortalBadge>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums tracking-[-0.02em]">
            {formatSocialCompact(entry.lockedAmount)}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Locked
          </p>
        </div>
      </div>
    </div>
  );
}

function EarnerRow({ entry, rank }: { entry: EarnerEntry; rank: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-foreground">
          {truncateAccountId(entry.accountId, 28)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-[-0.02em]">
          {formatSocialCompact(entry.totalEarned)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Earned
        </p>
      </div>
    </div>
  );
}

function CompositeRow({
  entry,
  rank,
}: {
  entry: CompositeEntry;
  rank: number;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-foreground">
          {truncateAccountId(entry.accountId, 28)}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <PortalBadge accent={commitmentAccent(entry.lockMonths)} size="xs">
            {entry.lockMonths > 0 ? `${entry.lockMonths}mo` : 'Rewards-only'}
          </PortalBadge>
          <span className="text-[11px] text-muted-foreground">
            {formatSocialCompact(entry.effectiveBoost)} boost ·{' '}
            {formatSocialCompact(entry.totalEarned)} earned
          </span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-[-0.02em]">
          {formatCompositeScore(entry.score)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Composite
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function BoostLeaderboardPage() {
  const [stats, setStats] = useState<BoostStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [activeTrack, setActiveTrack] = useState<TrackId>('influence');
  const [influenceData, setInfluenceData] = useState<BoosterEntry[]>([]);
  const [commitmentData, setCommitmentData] = useState<BoosterEntry[]>([]);
  const [compositeData, setCompositeData] = useState<CompositeEntry[]>([]);
  const [earnerData, setEarnerData] = useState<EarnerEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Stats from on-chain
  useEffect(() => {
    let cancelled = false;
    viewContractAt<BoostStats>(BOOST_CONTRACT, 'get_stats', {})
      .then((r) => {
        if (!cancelled) setStats(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaderboard data from Hasura
  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    try {
      const [inf, com, mix, ear] = await Promise.all([
        fetchInfluenceBoard(20),
        fetchCommitmentBoard(20),
        fetchCompositeBoard(20),
        fetchEarnerBoard(20),
      ]);
      if (inf?.boosterState) setInfluenceData(inf.boosterState);
      if (com?.boosterState) setCommitmentData(com.boosterState);
      if (mix?.composite) setCompositeData(mix.composite);
      if (ear?.earners) setEarnerData(ear.earners);
    } catch {
      // silently degrade — empty lists shown
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard, refreshKey]);

  const hasData =
    influenceData.length > 0 ||
    commitmentData.length > 0 ||
    compositeData.length > 0 ||
    earnerData.length > 0;

  function renderRows() {
    switch (activeTrack) {
      case 'influence':
        return influenceData.map((e, i) => (
          <InfluenceRow key={e.accountId} entry={e} rank={i + 1} />
        ));
      case 'commitment':
        return commitmentData.map((e, i) => (
          <CommitmentRow key={e.accountId} entry={e} rank={i + 1} />
        ));
      case 'composite':
        return compositeData.map((e, i) => (
          <CompositeRow key={e.accountId} entry={e} rank={i + 1} />
        ));
      case 'earners':
        return earnerData.map((e, i) => (
          <EarnerRow key={e.accountId} entry={e} rank={i + 1} />
        ));
    }
  }

  function activeItems() {
    switch (activeTrack) {
      case 'influence':
        return influenceData;
      case 'commitment':
        return commitmentData;
      case 'composite':
        return compositeData;
      case 'earners':
        return earnerData;
    }
  }

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Boost leaderboard"
        badgeAccent="purple"
        glowAccents={['purple', 'blue', 'green']}
        contentClassName="max-w-4xl"
        title="Boost Leaderboard"
        description="Ranked participants ordered by influence, commitment, blended protocol power, and rewards earned — powered by composable Substreams indexing."
      >
        <Button variant="outline" asChild>
          <Link href="/boost">
            <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
            Back to Boost
          </Link>
        </Button>
      </SecondaryPageHeader>

      {/* ── Stats Strip ────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {statsLoading ? (
            <div className="col-span-full flex min-h-24 items-center justify-center rounded-[1.25rem] border border-border/40 bg-background/35">
              <PulsingDots size="md" />
            </div>
          ) : (
            <>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Total locked
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {stats ? formatSocialCompact(stats.total_locked) : '0'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  SOCIAL committed
                </p>
              </SurfacePanel>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Network influence
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {stats
                    ? formatSocialCompact(stats.total_effective_boost)
                    : '0'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Weighted boost score
                </p>
              </SurfacePanel>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Weekly rate
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {stats
                    ? `${(stats.active_weekly_rate_bps / 100).toFixed(2)}%`
                    : '0.00%'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current release pace
                </p>
              </SurfacePanel>
            </>
          )}
        </div>
      </motion.section>

      {/* ── Leaderboard Panel ──────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mb-8"
      >
        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          {/* Track tabs */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {TRACKS.map((track) => {
              const Icon = track.icon;
              const isActive = activeTrack === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => setActiveTrack(track.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors',
                    isActive
                      ? `portal-${track.accent}-badge`
                      : 'border-border/40 bg-background/25 text-muted-foreground hover:border-border/60 hover:text-foreground/80'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {track.label}
                </button>
              );
            })}

            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/25 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground/80"
              title="Refresh data"
            >
              <RefreshCw
                className={cn('h-3 w-3', boardLoading && 'animate-spin')}
              />
            </button>
          </div>

          {/* Leaderboard rows */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTrack}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {boardLoading ? (
                <div className="flex min-h-48 items-center justify-center rounded-[1.25rem] border border-border/40 bg-background/35">
                  <PulsingDots size="md" />
                </div>
              ) : !hasData ? (
                <SurfacePanel
                  radius="md"
                  tone="inset"
                  className="py-12 text-center"
                >
                  <p className="text-sm text-muted-foreground">
                    No leaderboard data available yet. Participants will appear
                    once Boost activity is indexed.
                  </p>
                </SurfacePanel>
              ) : activeItems().length === 0 ? (
                <SurfacePanel
                  radius="md"
                  tone="inset"
                  className="py-12 text-center"
                >
                  <p className="text-sm text-muted-foreground">
                    No entries in this track yet.
                  </p>
                </SurfacePanel>
              ) : (
                <div className="divide-y divide-border/30 rounded-[1.25rem] border border-border/40 bg-background/30">
                  {renderRows()}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Footer count */}
          {!boardLoading && activeItems().length > 0 && (
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Showing {activeItems().length} participant
              {activeItems().length !== 1 ? 's' : ''}
            </p>
          )}
        </SurfacePanel>
      </motion.section>
    </PageShell>
  );
}
