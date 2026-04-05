'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Crown, Radar, Users } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button, buttonArrowLeftClass } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  BOOST_CONTRACT,
  viewContractAt,
  yoctoToSocial,
  type BoostStats,
} from '@/lib/near-rpc';

function formatSocialCompact(yocto: string): string {
  const social = Number.parseFloat(yoctoToSocial(yocto));

  if (!Number.isFinite(social)) {
    return '0';
  }

  return social.toLocaleString('en-US', {
    minimumFractionDigits: social >= 1000 ? 0 : 2,
    maximumFractionDigits: social >= 1000 ? 0 : 2,
  });
}

const LEADERBOARD_TRACKS = [
  {
    title: 'Influence rank',
    description:
      'Participants will be ordered by influence score after lock-duration bonuses are applied.',
  },
  {
    title: 'Momentum movers',
    description:
      'Weekly movers will highlight the biggest gainers, fresh entrants, and renewed commitments.',
  },
  {
    title: 'Campaign groups',
    description:
      'Community and guild views can cluster participants into shared pushes instead of raw whale charts.',
  },
] as const;

export default function BoostLeaderboardPage() {
  const [stats, setStats] = useState<BoostStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    viewContractAt<BoostStats>(BOOST_CONTRACT, 'get_stats', {})
      .then((result) => {
        if (!cancelled) {
          setStats(result);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Boost leaderboard"
        badgeAccent="purple"
        glowAccents={['purple', 'blue', 'green']}
        contentClassName="max-w-4xl"
        title="Leaderboard Coming Soon"
        description="This route is reserved for ranked Boost competition. It stays hidden from normal user flow until indexed participant data is live."
      >
        <Button variant="outline" asChild>
          <Link href="/boost">
            <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
            Back to Boost
          </Link>
        </Button>
      </SecondaryPageHeader>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <PortalBadge accent="purple" size="sm">
                Season Zero
              </PortalBadge>
              <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
                Internal preview only
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                The route stays in place so the information architecture is
                stable, but ranked entries are intentionally withheld until we
                have a reliable participant feed from substreams or another
                indexed source.
              </p>
            </div>

            <SurfacePanel
              radius="md"
              tone="inset"
              padding="snug"
              className="text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-2 font-medium text-foreground/85">
                <Radar className="h-4 w-4" />
                Data Source
              </div>
              <p className="mt-1 font-mono text-sm text-foreground">
                {BOOST_CONTRACT}
              </p>
            </SurfacePanel>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {loading ? (
              <div className="col-span-full flex min-h-28 items-center justify-center rounded-[1.25rem] border border-border/40 bg-background/35">
                <PulsingDots size="md" />
              </div>
            ) : (
              <>
                <SurfacePanel radius="md" tone="inset" padding="snug">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Total locked
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.03em]">
                    {stats ? formatSocialCompact(stats.total_locked) : '0'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    SOCIAL currently committed.
                  </p>
                </SurfacePanel>
                <SurfacePanel radius="md" tone="inset" padding="snug">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Influence Score
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.03em]">
                    {stats
                      ? formatSocialCompact(stats.total_effective_boost)
                      : '0'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Network influence score after bonus weighting.
                  </p>
                </SurfacePanel>
                <SurfacePanel radius="md" tone="inset" padding="snug">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Active rate
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.03em]">
                    {stats
                      ? `${(stats.active_weekly_rate_bps / 100).toFixed(2)}%`
                      : '0.00%'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current weekly release pace.
                  </p>
                </SurfacePanel>
              </>
            )}
          </div>
        </SurfacePanel>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mb-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]"
      >
        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <Crown className="h-4 w-4" />
            What will appear here
          </div>
          <div className="grid gap-3">
            {LEADERBOARD_TRACKS.map((track) => (
              <SurfacePanel key={track.title} radius="md" tone="inset">
                <p className="text-sm font-semibold text-foreground">
                  {track.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {track.description}
                </p>
              </SurfacePanel>
            ))}
          </div>
        </SurfacePanel>

        <SurfacePanel radius="xl" tone="soft" className="p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <Users className="h-4 w-4" />
            Launch requirement
          </div>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              A real leaderboard needs indexed participant accounts plus their
              effective boost at a shared snapshot.
            </p>
            <p>
              That can come from a new contract view like{' '}
              <span className="font-mono text-foreground">get_accounts</span> or
              from the substreams-backed API you already plan to wire.
            </p>
            <p>
              Once that exists, this route can render global rank, weekly
              movers, and community campaigns without changing its URL or IA.
            </p>
          </div>
        </SurfacePanel>
      </motion.section>
    </PageShell>
  );
}
