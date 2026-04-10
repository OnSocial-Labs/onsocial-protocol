'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Crown, TrendingUp, ArrowUpRight } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { section } from '@/lib/section-styles';
import {
  fetchCompactBoard,
  formatSocialCompact,
  truncateAccountId,
  commitmentAccent,
  commitmentLabel,
  type CompactLeaderboard,
} from '@/lib/leaderboard';

function MiniRank({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm">🥇</span>;
  if (rank === 2) return <span className="text-sm">🥈</span>;
  if (rank === 3) return <span className="text-sm">🥉</span>;
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border/40 bg-background/30 font-mono text-[10px] text-muted-foreground">
      {rank}
    </span>
  );
}

export function LeaderboardPreview() {
  const [data, setData] = useState<CompactLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCompactBoard()
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasData =
    data && (data.influence.length > 0 || data.earners.length > 0);

  // Don't render the section if there's no data after loading
  if (!loading && !hasData) return null;

  return (
    <section className={section.py}>
      <div className={section.container}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className={section.heading}>Boost Leaderboard</p>

          {loading ? (
            <div className="flex min-h-32 items-center justify-center rounded-[1.5rem] border border-border/50 bg-background/35">
              <PulsingDots size="md" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Influence */}
              <SurfacePanel radius="xl" tone="soft" className="p-4 md:p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Crown className="h-3.5 w-3.5" />
                  Top Influence
                </div>
                <div className="space-y-2">
                  {data!.influence.map((e, i) => (
                    <div
                      key={e.accountId}
                      className="flex items-center gap-2.5"
                    >
                      <MiniRank rank={i + 1} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-foreground">
                          {truncateAccountId(e.accountId, 22)}
                        </p>
                      </div>
                      <PortalBadge
                        accent={commitmentAccent(e.lockMonths)}
                        size="xs"
                      >
                        {commitmentLabel(e.lockMonths)}
                      </PortalBadge>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatSocialCompact(e.effectiveBoost)}
                      </span>
                    </div>
                  ))}
                </div>
              </SurfacePanel>

              {/* Earners */}
              <SurfacePanel radius="xl" tone="soft" className="p-4 md:p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Top Earners
                </div>
                <div className="space-y-2">
                  {data!.earners.map((e, i) => (
                    <div
                      key={e.accountId}
                      className="flex items-center gap-2.5"
                    >
                      <MiniRank rank={i + 1} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-foreground">
                          {truncateAccountId(e.accountId, 22)}
                        </p>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatSocialCompact(e.totalEarned)}
                      </span>
                    </div>
                  ))}
                </div>
              </SurfacePanel>
            </div>
          )}

          {/* Link to full leaderboard */}
          {!loading && hasData && (
            <div className="mt-4 text-center">
              <Link
                href="/boost/leaderboard"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                View full leaderboard
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
