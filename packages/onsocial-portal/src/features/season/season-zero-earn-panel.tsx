'use client';

import { SurfacePanel } from '@/components/ui/surface-panel';
import { cn } from '@/lib/utils';

export interface SeasonZeroScoringLimits {
  join: { points: number };
  profile: {
    name: number;
    bio: number;
    avatar: number;
    link: number;
    linkCap: number;
    max: number;
  };
  endorsements: {
    endorserPoints: number;
    endorserDailyCap: number;
    endorserSeasonCap: number;
    topicPoints: number;
    topicDailyCap: number;
    topicSeasonCap: number;
    max: number;
  };
  solidarity: {
    receivedPoints: number;
    receivedDailyCap: number;
    receivedSeasonCap: number;
    mutualPoints: number;
    mutualDailyCap: number;
    mutualSeasonCap: number;
    dailyCap: number;
    max: number;
  };
  support: { sqrtPoints: number; max: number };
  boost: { sqrtPoints: number; max: number };
  totalMax: number;
}

export type SeasonZeroBreakdownKey =
  | 'join'
  | 'profile'
  | 'endorsements'
  | 'solidarity'
  | 'support'
  | 'boost';

export const SEASON_ZERO_SCORE_BUCKETS: {
  key: SeasonZeroBreakdownKey;
  label: string;
}[] = [
  { key: 'join', label: 'Join' },
  { key: 'profile', label: 'Profile' },
  { key: 'endorsements', label: 'Endorse' },
  { key: 'solidarity', label: 'Stand' },
  { key: 'support', label: 'Support' },
  { key: 'boost', label: 'Boost' },
];

export const seasonZeroBucketMax: Record<
  SeasonZeroBreakdownKey,
  (limits: SeasonZeroScoringLimits) => number
> = {
  join: (limits) => limits.join.points,
  profile: (limits) => limits.profile.max,
  endorsements: (limits) => limits.endorsements.max,
  solidarity: (limits) => limits.solidarity.max,
  support: (limits) => limits.support.max,
  boost: (limits) => limits.boost.max,
};

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  );
}

export function SeasonZeroProgressRow({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium capitalize text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">
          {formatScore(value)} / {formatScore(max)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
        <div
          className={cn(
            'h-full rounded-full bg-[var(--portal-gold)] transition-[width]',
            pct >= 100 && 'bg-[var(--portal-green)]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/75">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SeasonZeroEarnPanel({
  limits,
  breakdown,
  className,
}: {
  limits: SeasonZeroScoringLimits;
  breakdown?: Record<SeasonZeroBreakdownKey, number> | null;
  className?: string;
}) {
  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      className={cn('space-y-4', className)}
    >
      <div>
        <p className="portal-eyebrow text-muted-foreground">
          Genesis Rally · daily + season caps
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          How to earn points
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join with 100 SOCIAL, then grow your score all season. Social buckets
          use UTC daily limits and a season ceiling — one big day cannot max you
          out. Standing with, endorsing, or supporting others raises{' '}
          <span className="text-foreground">their</span> score, not yours.
        </p>
      </div>

      <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <li>
          <span className="font-medium text-foreground">Join</span> —{' '}
          {formatScore(limits.join.points)} pts once (100 SOCIAL)
        </li>
        <li>
          <span className="font-medium text-foreground">Profile</span> — up to{' '}
          {formatScore(limits.profile.max)} (name, bio, avatar, 2 links)
        </li>
        <li>
          <span className="font-medium text-foreground">Endorsements</span> —{' '}
          others endorse you: {limits.endorsements.endorserDailyCap}/day
          endorsers, {limits.endorsements.topicDailyCap}/day topics (season caps
          apply)
        </li>
        <li>
          <span className="font-medium text-foreground">Solidarity</span> —{' '}
          stands with you: {limits.solidarity.receivedDailyCap} incoming +{' '}
          {limits.solidarity.mutualDailyCap} mutual per day (max{' '}
          {formatScore(limits.solidarity.dailyCap)} pts/day)
        </li>
        <li>
          <span className="font-medium text-foreground">Support</span> — SOCIAL
          sent to your profile (√ curve, season max{' '}
          {formatScore(limits.support.max)})
        </li>
        <li>
          <span className="font-medium text-foreground">Boost</span> — your
          lock/extend (√ curve, season max {formatScore(limits.boost.max)})
        </li>
      </ul>

      <p className="text-xs text-muted-foreground/80">
        Theoretical season max ≈ {formatScore(limits.totalMax)}. Scores use
        indexed data after your join; refresh after activity — the indexer can
        lag a few minutes.
      </p>

      {breakdown ? (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your season progress
          </p>
          {SEASON_ZERO_SCORE_BUCKETS.map(({ key, label }) => (
            <SeasonZeroProgressRow
              key={key}
              label={label}
              value={breakdown[key]}
              max={seasonZeroBucketMax[key](limits)}
              hint={
                key === 'endorsements' || key === 'solidarity'
                  ? 'Earn more on new UTC days until the season cap.'
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </SurfacePanel>
  );
}
