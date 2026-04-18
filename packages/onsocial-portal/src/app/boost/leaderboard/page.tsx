'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  Crown,
  Flame,
  RefreshCw,
  Shield,
  TrendingUp,
  Zap,
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
  fetchInfluenceBoard,
  fetchReputationBoard,
  fetchEarnerBoard,
  formatSocialCompact,
  formatReputation,
  formatScore,
  truncateAccountId,
  commitmentLabel,
  commitmentAccent,
  reputationTier,
  pctOfLeader,
  type InfluenceEntry,
  type ReputationEntry,
  type EarnerEntry,
} from '@/lib/leaderboard';
import { cn } from '@/lib/utils';

// ─── Track Definitions ──────────────────────────────────────────
type TrackId = 'influence' | 'reputation' | 'earners';

const TRACKS: {
  id: TrackId;
  label: string;
  icon: typeof Crown;
  accent: 'purple' | 'amber' | 'green';
  description: string;
}[] = [
  {
    id: 'influence',
    label: 'Influence',
    icon: Crown,
    accent: 'purple',
    description: 'Ranked by boost power from locked SOCIAL tokens',
  },
  {
    id: 'reputation',
    label: 'Reputation',
    icon: Shield,
    accent: 'amber',
    description: 'Composite score from activity, commitment & quality',
  },
  {
    id: 'earners',
    label: 'Earners',
    icon: TrendingUp,
    accent: 'green',
    description: 'Top participants by total rewards earned',
  },
];

// ─── Podium: Top 3 with visual hierarchy ─────────────────────────

function PodiumCard({
  rank,
  name,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  accent,
}: {
  rank: 1 | 2 | 3;
  name: string;
  primary: string;
  primaryLabel: string;
  secondary?: string;
  secondaryLabel?: string;
  accent: string;
}) {
  const medals = ['🥇', '🥈', '🥉'] as const;
  const heights = ['h-28', 'h-20', 'h-16'] as const;
  const sizes = [
    'text-3xl md:text-4xl',
    'text-2xl md:text-3xl',
    'text-xl md:text-2xl',
  ] as const;
  const order = ['order-2', 'order-1', 'order-3'] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: rank * 0.1 }}
      className={cn('flex flex-col items-center', order[rank - 1])}
    >
      <span className={cn('mb-1', sizes[rank - 1])}>{medals[rank - 1]}</span>
      <p className="mb-2 max-w-[140px] truncate font-mono text-xs text-foreground md:max-w-[180px] md:text-sm">
        {truncateAccountId(name, 18)}
      </p>
      <div
        className={cn(
          'flex w-full flex-col items-center justify-end rounded-t-2xl border border-border/50 px-3 pb-3',
          `portal-${accent}-surface`,
          heights[rank - 1]
        )}
      >
        <p className="font-mono text-base font-bold tabular-nums tracking-tight md:text-lg">
          {primary}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {primaryLabel}
        </p>
        {secondary && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {secondary} {secondaryLabel}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Progress bar row for rank 4+ ─────────────────────────────────

function InfluenceRow({
  entry,
  leaderBoost,
}: {
  entry: InfluenceEntry;
  leaderBoost: string;
}) {
  const pct = pctOfLeader(entry.effectiveBoost, leaderBoost);
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-background/40 md:px-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/30 font-mono text-xs tabular-nums text-muted-foreground">
        {entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm text-foreground">
            {truncateAccountId(entry.accountId, 26)}
          </p>
          <PortalBadge accent={commitmentAccent(entry.lockMonths)} size="xs">
            {commitmentLabel(entry.lockMonths)}
          </PortalBadge>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-[var(--portal-purple)]"
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-tight">
          {formatSocialCompact(entry.effectiveBoost)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Boost
        </p>
      </div>
    </div>
  );
}

function ReputationRow({
  entry,
  leaderRep,
}: {
  entry: ReputationEntry;
  leaderRep: string;
}) {
  const pct = pctOfLeader(entry.reputation, leaderRep);
  const tier = reputationTier(entry.rank);
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-background/40 md:px-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/30 font-mono text-xs tabular-nums text-muted-foreground">
        {entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm text-foreground">
            {truncateAccountId(entry.accountId, 22)}
          </p>
          <PortalBadge accent={tier.accent} size="xs">
            {tier.label}
          </PortalBadge>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {entry.standingWith > 0 && (
            <span>{entry.standingWith} stand with</span>
          )}
          {entry.totalPosts > 0 && <span>{entry.totalPosts} posts</span>}
          {entry.activeDays > 0 && <span>{entry.activeDays}d active</span>}
          {entry.reactionsReceived > 0 && (
            <span>{entry.reactionsReceived} reactions</span>
          )}
          {entry.scarcesCreated > 0 && (
            <span>{entry.scarcesCreated} scarces</span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-[var(--portal-amber)]"
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-tight">
          {formatReputation(entry.reputation)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Rep
        </p>
      </div>
    </div>
  );
}

function EarnerRow({
  entry,
  leaderEarned,
}: {
  entry: EarnerEntry;
  leaderEarned: string;
}) {
  const pct = pctOfLeader(entry.totalEarned, leaderEarned);
  const hasUnclaimed =
    entry.unclaimed && entry.unclaimed !== '0' && entry.unclaimed !== '';
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-background/40 md:px-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/30 font-mono text-xs tabular-nums text-muted-foreground">
        {entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm text-foreground">
            {truncateAccountId(entry.accountId, 26)}
          </p>
          {hasUnclaimed && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--portal-green)]">
              <Zap className="h-2.5 w-2.5" />
              {formatSocialCompact(entry.unclaimed!)} claimable
            </span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-[var(--portal-green)]"
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-tight">
          {formatSocialCompact(entry.totalEarned)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Earned
        </p>
      </div>
    </div>
  );
}

// ─── Score breakdown panel (reputation track only) ───────────────

function ScoreBreakdown({ entry }: { entry: ReputationEntry }) {
  const scores = [
    {
      label: 'Commitment',
      value: entry.commitmentScore,
      icon: Flame,
      accent: 'purple',
    },
    {
      label: 'Standing',
      value: entry.socialScore,
      icon: Crown,
      accent: 'blue',
    },
    {
      label: 'Quality',
      value: entry.qualityScore,
      icon: Shield,
      accent: 'amber',
    },
    {
      label: 'Consistency',
      value: entry.consistencyScore,
      icon: TrendingUp,
      accent: 'green',
    },
    {
      label: 'Scarces',
      value: entry.scarcesScore,
      icon: Zap,
      accent: 'pink' as const,
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-2 rounded-xl border border-border/30 bg-background/20 p-3">
      {scores.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="flex flex-col items-center gap-1">
            <Icon className={cn('h-3.5 w-3.5', `portal-${s.accent}-text`)} />
            <p className="font-mono text-xs font-semibold tabular-nums">
              {formatScore(s.value)}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function BoostLeaderboardPage() {
  const [stats, setStats] = useState<BoostStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [activeTrack, setActiveTrack] = useState<TrackId>('reputation');
  const [influenceData, setInfluenceData] = useState<InfluenceEntry[]>([]);
  const [reputationData, setReputationData] = useState<ReputationEntry[]>([]);
  const [earnerData, setEarnerData] = useState<EarnerEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    try {
      const [inf, rep, ear] = await Promise.all([
        fetchInfluenceBoard(20),
        fetchReputationBoard(20),
        fetchEarnerBoard(20),
      ]);
      if (inf?.leaderboardBoost) setInfluenceData(inf.leaderboardBoost);
      if (rep?.reputationScores) setReputationData(rep.reputationScores);
      if (ear?.leaderboardRewards) setEarnerData(ear.leaderboardRewards);
    } catch {
      // silently degrade
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard, refreshKey]);

  const hasData =
    influenceData.length > 0 ||
    reputationData.length > 0 ||
    earnerData.length > 0;

  // Get the current track's top 3 and rest
  function getTrackData() {
    switch (activeTrack) {
      case 'influence':
        return influenceData;
      case 'reputation':
        return reputationData;
      case 'earners':
        return earnerData;
    }
  }

  const trackData = getTrackData();
  const top3 = trackData.slice(0, 3);
  const rest = trackData.slice(3);
  const activeTrackDef = TRACKS.find((t) => t.id === activeTrack)!;

  function renderPodium() {
    if (top3.length === 0) return null;
    const accent = activeTrackDef.accent;

    const makePodiumProps = (
      entry: (typeof top3)[number],
      idx: number
    ): {
      rank: 1 | 2 | 3;
      name: string;
      primary: string;
      primaryLabel: string;
      secondary?: string;
      secondaryLabel?: string;
      accent: string;
    } => {
      const base = {
        rank: (idx + 1) as 1 | 2 | 3,
        name: entry.accountId,
        accent,
      };

      if (activeTrack === 'influence') {
        const e = entry as InfluenceEntry;
        return {
          ...base,
          primary: formatSocialCompact(e.effectiveBoost),
          primaryLabel: 'Boost',
          secondary: `${e.lockMonths}mo`,
          secondaryLabel: 'lock',
        };
      }
      if (activeTrack === 'reputation') {
        const e = entry as ReputationEntry;
        return {
          ...base,
          primary: formatReputation(e.reputation),
          primaryLabel: 'Reputation',
          secondary: `${e.activeDays}d`,
          secondaryLabel: 'active',
        };
      }
      const e = entry as EarnerEntry;
      return {
        ...base,
        primary: formatSocialCompact(e.totalEarned),
        primaryLabel: 'Earned',
        secondary: e.creditCount ? `${e.creditCount}` : undefined,
        secondaryLabel: 'credits',
      };
    };

    return (
      <div className="mb-6 flex items-end justify-center gap-3 md:gap-6">
        {top3.map((entry, i) => (
          <PodiumCard key={entry.accountId} {...makePodiumProps(entry, i)} />
        ))}
      </div>
    );
  }

  function renderRows() {
    if (rest.length === 0) return null;

    switch (activeTrack) {
      case 'influence': {
        const leader = influenceData[0]?.effectiveBoost ?? '1';
        return (rest as InfluenceEntry[]).map((e) => (
          <InfluenceRow key={e.accountId} entry={e} leaderBoost={leader} />
        ));
      }
      case 'reputation': {
        const leader = reputationData[0]?.reputation ?? '1';
        return (rest as ReputationEntry[]).map((e) => (
          <ReputationRow key={e.accountId} entry={e} leaderRep={leader} />
        ));
      }
      case 'earners': {
        const leader = earnerData[0]?.totalEarned ?? '1';
        return (rest as EarnerEntry[]).map((e) => (
          <EarnerRow key={e.accountId} entry={e} leaderEarned={leader} />
        ));
      }
    }
  }

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Leaderboard"
        badgeAccent="blue"
        glowAccents={['blue', 'green']}
        contentClassName="max-w-4xl"
        title="Reputation"
        description="Your reputation multiplies everything: posts, reactions, locks, and rewards. The more ways you participate, the faster you climb."
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
        <div className="grid gap-3 md:grid-cols-4">
          {statsLoading ? (
            <div className="col-span-full flex min-h-24 items-center justify-center rounded-[1.25rem] border border-border/40 bg-background/35">
              <PulsingDots size="md" />
            </div>
          ) : (
            <>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Ranked users
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {reputationData.length}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Building reputation
                </p>
              </SurfacePanel>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Top reputation
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {reputationData[0]
                    ? formatReputation(reputationData[0].reputation)
                    : '—'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Score to beat
                </p>
              </SurfacePanel>
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
                  Weekly rewards
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {stats
                    ? `${(stats.active_weekly_rate_bps / 100).toFixed(2)}%`
                    : '0.00%'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Earned by participating
                </p>
              </SurfacePanel>
            </>
          )}
        </div>
      </motion.section>

      {/* ── Track Tabs ─────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mb-8"
      >
        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
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

          <p className="mb-5 text-xs text-muted-foreground">
            {activeTrackDef.description}
          </p>

          {/* Content */}
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
                    No leaderboard data yet. Participants will appear once
                    activity is indexed.
                  </p>
                </SurfacePanel>
              ) : trackData.length === 0 ? (
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
                <>
                  {/* Podium */}
                  {renderPodium()}

                  {/* Score breakdown for #1 in reputation track */}
                  {activeTrack === 'reputation' && reputationData[0] && (
                    <div className="mb-4">
                      <p className="mb-2 text-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        #1 score breakdown
                      </p>
                      <ScoreBreakdown entry={reputationData[0]} />
                    </div>
                  )}

                  {/* Remaining rows */}
                  {rest.length > 0 && (
                    <div className="divide-y divide-border/30 rounded-[1.25rem] border border-border/40 bg-background/30">
                      {renderRows()}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {!boardLoading && trackData.length > 0 && (
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Showing {trackData.length} participant
              {trackData.length !== 1 ? 's' : ''}
            </p>
          )}
        </SurfacePanel>
      </motion.section>

      {/* ── How Reputation Works ─────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="mb-8"
      >
        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          <p className="mb-3 text-center text-sm font-semibold">
            How reputation works
          </p>
          <p className="mx-auto mb-4 max-w-lg text-center text-xs text-muted-foreground">
            Your reputation is the product of five scores — each one multiplies
            the others. Even small gains in a weak area can dramatically boost
            your rank.
          </p>
          <div className="grid gap-3 md:grid-cols-5">
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <Crown className="mx-auto mb-1 h-4 w-4 portal-purple-text" />
              <p className="text-xs font-semibold">Standing</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Grow your standing — people standing with you
              </p>
            </SurfacePanel>
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <Flame className="mx-auto mb-1 h-4 w-4 portal-amber-text" />
              <p className="text-xs font-semibold">Commitment</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Lock SOCIAL tokens — longer locks = bigger multiplier
              </p>
            </SurfacePanel>
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <Shield className="mx-auto mb-1 h-4 w-4 portal-blue-text" />
              <p className="text-xs font-semibold">Quality</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Create posts that earn reactions from others
              </p>
            </SurfacePanel>
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <TrendingUp className="mx-auto mb-1 h-4 w-4 portal-green-text" />
              <p className="text-xs font-semibold">Consistency</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Be active every day — each day adds to your score
              </p>
            </SurfacePanel>
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <Zap className="mx-auto mb-1 h-4 w-4 portal-pink-text" />
              <p className="text-xs font-semibold">Scarces</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Create & sell digital collectibles on the marketplace
              </p>
            </SurfacePanel>
          </div>
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Reputation = Standing × Commitment × Quality × Consistency × Scarces
          </p>
        </SurfacePanel>
      </motion.section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-8"
      >
        <SurfacePanel
          radius="xl"
          tone="deep"
          className="p-6 text-center md:p-8"
        >
          <p className="mb-2 text-lg font-semibold">
            Every action multiplies your reputation
          </p>
          <p className="mx-auto mb-4 max-w-lg text-sm text-muted-foreground">
            Locking tokens doesn&apos;t just earn rewards — it multiplies your
            entire reputation score. Earned SOCIAL from participating? Lock it
            to amplify everything you&apos;ve built.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/boost">
                <Flame className="mr-1.5 h-4 w-4" />
                Lock & Multiply
              </Link>
            </Button>
          </div>
        </SurfacePanel>
      </motion.section>
    </PageShell>
  );
}
