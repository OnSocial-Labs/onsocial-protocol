'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Crown, Flame, RefreshCw, Shield, TrendingUp, Zap } from 'lucide-react';
import { StandingIdentity } from '@onsocial/ui';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { getPortalProfileUrl } from '@/lib/portal-config';
import {
  fetchInfluenceBoard,
  fetchReputationBoard,
  fetchEarnerBoard,
  formatSocialCompact,
  formatReputation,
  formatScore,
  commitmentLabel,
  commitmentAccent,
  reputationBoardMeta,
  reputationTier,
  pctOfLeader,
  type InfluenceEntry,
  type ReputationEntry,
  type EarnerEntry,
} from '@/lib/leaderboard';
import { cn } from '@/lib/utils';
import { BoostLeaderboardPageIntro } from '@/features/boost/boost-leaderboard-page-intro';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { useNavBack } from '@/hooks/use-nav-back';
import type { BoostContractStats as BoostStats } from '@onsocial/sdk';

const os = createPortalOnSocialClient();

// ─── Track Definitions ──────────────────────────────────────────
type TrackId = 'influence' | 'reputation' | 'earners';

const TRACKS: {
  id: TrackId;
  label: string;
  icon: typeof Crown;
  accent: 'purple' | 'gold' | 'green';
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
    accent: 'gold',
    description: 'Composite score from activity, commitment & quality',
  },
  {
    id: 'earners',
    label: 'Earners',
    icon: TrendingUp,
    accent: 'green',
    description: 'Top participants by SOCIAL earned on-chain',
  },
];

// ─── Board rows ──────────────────────────────────────────────────

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
      <Link
        href={getPortalProfileUrl(entry.accountId)}
        className="min-w-0 flex-1"
      >
        <div className="flex items-center gap-2">
          <StandingIdentity
            accountId={entry.accountId}
            size="sm"
            showHandle={false}
            nameTrailing={
              <PortalBadge
                accent={commitmentAccent(entry.lockMonths)}
                size="xs"
              >
                {commitmentLabel(entry.lockMonths)}
              </PortalBadge>
            }
          />
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-[var(--portal-purple)]"
          />
        </div>
      </Link>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-tight">
          {formatSocialCompact(entry.effectiveBoost)}
        </p>
        <p className="portal-eyebrow text-muted-foreground">Boost</p>
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
        <Link
          href={getPortalProfileUrl(entry.accountId)}
          className="flex items-center gap-2"
        >
          <StandingIdentity
            accountId={entry.accountId}
            size="sm"
            showHandle={false}
            nameTrailing={
              <PortalBadge accent={tier.accent} size="xs">
                {tier.label}
              </PortalBadge>
            }
          />
        </Link>
        <div className="mt-1 portal-type-caption text-muted-foreground">
          {reputationBoardMeta(entry)}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-[var(--portal-gold)]"
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums tracking-tight">
          {formatReputation(entry.reputation)}
        </p>
        <p className="portal-eyebrow text-muted-foreground">Rep</p>
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
        <Link
          href={getPortalProfileUrl(entry.accountId)}
          className="flex min-w-0 flex-1 flex-col gap-1"
        >
          <div className="flex items-center gap-2">
            <StandingIdentity
              accountId={entry.accountId}
              size="sm"
              showHandle={false}
              nameTrailing={
                hasUnclaimed ? (
                  <span className="inline-flex items-center gap-0.5 portal-type-caption text-[var(--portal-green)]">
                    <Zap className="h-2.5 w-2.5" />
                    {formatSocialCompact(entry.unclaimed!)} claimable
                  </span>
                ) : null
              }
            />
          </div>
        </Link>
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
        <p className="portal-eyebrow text-muted-foreground">Earned</p>
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
      label: 'Social',
      value: entry.socialScore,
      icon: Crown,
      accent: 'blue',
    },
    {
      label: 'Quality',
      value: entry.qualityScore,
      icon: Shield,
      accent: 'gold',
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
            <p className="portal-type-micro uppercase tracking-wider text-muted-foreground">
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
  useNavBack('Boost');
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
    os.boost
      .getStats()
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
  const activeTrackDef = TRACKS.find((t) => t.id === activeTrack)!;

  function renderRows() {
    if (trackData.length === 0) return null;

    switch (activeTrack) {
      case 'influence': {
        const leader = influenceData[0]?.effectiveBoost ?? '1';
        return (trackData as InfluenceEntry[]).map((e) => (
          <InfluenceRow key={e.accountId} entry={e} leaderBoost={leader} />
        ));
      }
      case 'reputation': {
        const leader = reputationData[0]?.reputation ?? '1';
        return (trackData as ReputationEntry[]).map((e) => (
          <ReputationRow key={e.accountId} entry={e} leaderRep={leader} />
        ));
      }
      case 'earners': {
        const leader = earnerData[0]?.totalEarned ?? '1';
        return (trackData as EarnerEntry[]).map((e) => (
          <EarnerRow key={e.accountId} entry={e} leaderEarned={leader} />
        ));
      }
    }
  }

  return (
    <PageShell className="max-w-6xl">
      <BoostLeaderboardPageIntro />

      {/* ── Stats Strip ────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-6"
      >
        <div className="grid gap-3 md:grid-cols-4">
          {statsLoading ? (
            <div className="col-span-full flex min-h-24 items-center justify-center rounded-[1.25rem] border border-border/40 bg-background/35">
              <PulsingDots size="md" />
            </div>
          ) : (
            <>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="portal-eyebrow-wide text-muted-foreground">
                  Top influence
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {influenceData[0]
                    ? formatSocialCompact(influenceData[0].effectiveBoost)
                    : '—'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Boost to beat
                </p>
              </SurfacePanel>
              <SurfacePanel radius="md" tone="inset" padding="snug">
                <p className="portal-eyebrow-wide text-muted-foreground">
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
                <p className="portal-eyebrow-wide text-muted-foreground">
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
                <p className="portal-eyebrow-wide text-muted-foreground">
                  Weekly pace
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums tracking-[-0.03em]">
                  {stats
                    ? `${(stats.active_weekly_rate_bps / 100).toFixed(2)}%`
                    : '0.00%'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Network release rate
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
        className="mb-6"
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
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 portal-eyebrow transition-colors',
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

            <PortalHoverTooltip tooltip="Refresh data" className="ml-auto">
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/25 px-2.5 py-1.5 portal-eyebrow text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground/80"
                aria-label="Refresh data"
              >
                <RefreshCw
                  className={cn('h-3 w-3', boardLoading && 'animate-spin')}
                />
              </button>
            </PortalHoverTooltip>
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
                  {activeTrack === 'reputation' && reputationData[0] && (
                    <div className="mb-4">
                      <p className="mb-2 text-center portal-eyebrow-wide text-muted-foreground">
                        #1 score breakdown
                      </p>
                      <ScoreBreakdown entry={reputationData[0]} />
                    </div>
                  )}

                  <div className="divide-y divide-border/30 rounded-[1.25rem] border border-border/40 bg-background/30">
                    {renderRows()}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {!boardLoading && trackData.length > 0 && (
            <p className="mt-3 text-center portal-eyebrow text-muted-foreground">
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
        className="mb-6"
      >
        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          <BoostPanelSectionTitle align="center" className="mb-3">
            How reputation works
          </BoostPanelSectionTitle>
          <p className="mx-auto mb-4 max-w-lg text-center text-xs text-muted-foreground">
            Five indexed signals combine into one score. Weighted stands,
            endorsements, and paid support feed Social; replies and quotes
            received strengthen Quality. Early contributions count more; large
            totals are softened.
          </p>
          <div className="grid gap-3 md:grid-cols-5">
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <Crown className="mx-auto mb-1 h-4 w-4 portal-purple-text" />
              <p className="text-xs font-semibold">Social</p>
              <p className="mt-0.5 portal-type-caption text-muted-foreground">
                Weighted stands, endorsements, paid support
              </p>
            </SurfacePanel>
            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-center"
            >
              <Flame className="mx-auto mb-1 h-4 w-4 portal-gold-text" />
              <p className="text-xs font-semibold">Commitment</p>
              <p className="mt-0.5 portal-type-caption text-muted-foreground">
                Locked SOCIAL and lock duration
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
              <p className="mt-0.5 portal-type-caption text-muted-foreground">
                Reactions, conversations, and amplifies received
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
              <p className="mt-0.5 portal-type-caption text-muted-foreground">
                Active days, diminishing returns
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
              <p className="mt-0.5 portal-type-caption text-muted-foreground">
                Creates, sales, and unique love fans
              </p>
            </SurfacePanel>
          </div>
          <p className="mt-3 text-center portal-eyebrow text-muted-foreground">
            Reputation = Social × Commitment × Quality × Consistency × Scarces
          </p>
        </SurfacePanel>
      </motion.section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-6"
      >
        <SurfacePanel
          radius="xl"
          tone="deep"
          className="p-6 text-center md:p-8"
        >
          <p className="mb-2 text-lg font-semibold">Grow your reputation</p>
          <p className="mx-auto mb-4 max-w-lg text-sm text-muted-foreground">
            Participate across the network, then lock SOCIAL to strengthen your
            commitment signal.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/boost">
                <Flame className="mr-1.5 h-4 w-4" />
                Lock SOCIAL
              </Link>
            </Button>
          </div>
        </SurfacePanel>
      </motion.section>
    </PageShell>
  );
}
