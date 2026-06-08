'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  SEASON_ZERO_SCORE_BUCKETS,
  SeasonZeroProgressRow,
  seasonZeroBucketMax,
  type SeasonZeroScoringLimits,
} from '@/features/season/season-zero-earn-panel';
import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import { GENESIS_RALLY_JOIN_SOCIAL_LABEL } from '@/lib/genesis-season';
import { portalTransition } from '@/lib/motion';
import { cn } from '@/lib/utils';

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  );
}

function GuidePoint({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 font-medium text-foreground">{label}</span>
      <span className="text-right text-muted-foreground">{value}</span>
    </li>
  );
}

export function SeasonZeroGuidePanel({
  limits,
  myStanding = null,
  className,
}: {
  limits: SeasonZeroScoringLimits;
  myStanding?: Pick<SeasonZeroStanding, 'rank' | 'score' | 'breakdown'> | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const headerHint = myStanding
    ? `#${myStanding.rank} · ${formatScore(myStanding.score)} pts`
    : `Up to ~${formatScore(limits.totalMax)} pts`;

  const activeBuckets = myStanding
    ? SEASON_ZERO_SCORE_BUCKETS.filter(
        ({ key }) => myStanding.breakdown[key] > 0
      )
    : [];

  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="snug"
      className={cn('border-border/40', className)}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block portal-eyebrow text-muted-foreground">
            Rules & scoring
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground/75">
            {headerHint}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="season-zero-guide-details"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }
            }
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={portalTransition(reduceMotion ? 0.15 : 0.24)}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-4 border-t border-fade-section pt-3">
              {myStanding ? (
                <div className="space-y-3">
                  <p className="portal-eyebrow text-muted-foreground">
                    Your score
                  </p>
                  {activeBuckets.length > 0 ? (
                    <div className="space-y-2.5">
                      {activeBuckets.map(({ key, label }) => (
                        <SeasonZeroProgressRow
                          key={key}
                          label={label}
                          value={myStanding.breakdown[key]}
                          max={seasonZeroBucketMax[key](limits)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Join pts only so far — grow profile and social activity to
                      add more.
                    </p>
                  )}
                  <p className="portal-type-caption text-muted-foreground/65">
                    Full breakdown also shows on your standing row above.
                  </p>
                </div>
              ) : null}

              <div
                className={cn(
                  'space-y-2',
                  myStanding && 'border-t border-fade-section pt-4'
                )}
              >
                <p className="portal-eyebrow text-muted-foreground">
                  How to earn
                </p>
                <ul className="space-y-1.5">
                  <GuidePoint
                    label="Join"
                    value={`${formatScore(limits.join.points)} pts once`}
                  />
                  <GuidePoint
                    label="Profile"
                    value={`Up to ${formatScore(limits.profile.max)}`}
                  />
                  <GuidePoint
                    label="Endorse"
                    value={`${limits.endorsements.endorserDailyCap}/day · season caps`}
                  />
                  <GuidePoint
                    label="Stand"
                    value={`${limits.solidarity.receivedDailyCap} + ${limits.solidarity.mutualDailyCap} mutual/day`}
                  />
                  <GuidePoint
                    label="Support"
                    value={`√ curve · max ${formatScore(limits.support.max)}`}
                  />
                  <GuidePoint
                    label="Boost"
                    value={`√ curve · max ${formatScore(limits.boost.max)}`}
                  />
                </ul>
              </div>

              <div className="space-y-2 border-t border-fade-section pt-4">
                <p className="portal-eyebrow text-muted-foreground">Rewards</p>
                <ul className="space-y-1.5">
                  <GuidePoint
                    label="Entry"
                    value={`${GENESIS_RALLY_JOIN_SOCIAL_LABEL} SOCIAL`}
                  />
                  <GuidePoint
                    label="Split"
                    value="70% equal · 30% by activity"
                  />
                  <GuidePoint label="Claim" value="On this page when open" />
                </ul>
              </div>

              <p className="portal-type-caption text-muted-foreground/65">
                Others endorsing or standing with you raises your score.
                Activity counts after you join — allow a few minutes to index.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SurfacePanel>
  );
}
