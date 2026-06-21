'use client';

import { useEffect, useState } from 'react';
import {
  SEASON_ZERO_SCORE_BUCKETS,
  SeasonZeroProgressRow,
  seasonZeroBucketMax,
  type SeasonZeroScoringLimits,
} from '@/features/season/season-zero-earn-panel';
import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import type { SeasonZeroPayoutParticipant } from '@/features/season/season-zero-payout-estimate';
import {
  fetchJoinRallyRouting,
  formatJoinEntryGuideLabel,
} from '@/lib/join-rally-routing';
import { seasonZeroPayoutSummary } from '@/features/season/season-zero-payout-copy';
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

export function SeasonZeroRulesContent({
  limits,
  myStanding = null,
  participantCount = 0,
  indexedPoolYocto = '0',
  payoutParticipants = null,
  personalAccountId = null,
  profileBadgeLabel = 'Rally',
  className,
}: {
  limits: SeasonZeroScoringLimits;
  myStanding?: Pick<
    SeasonZeroStanding,
    'rank' | 'score' | 'breakdown' | 'accountId'
  > | null;
  participantCount?: number;
  indexedPoolYocto?: string;
  payoutParticipants?: SeasonZeroPayoutParticipant[] | null;
  personalAccountId?: string | null;
  profileBadgeLabel?: string;
  className?: string;
}) {
  const [joinRouting, setJoinRouting] =
    useState<Awaited<ReturnType<typeof fetchJoinRallyRouting>>>(null);
  const [joinEntryLabel, setJoinEntryLabel] = useState('Loading rally entry…');

  useEffect(() => {
    let cancelled = false;

    void fetchJoinRallyRouting()
      .then((routing) => {
        if (cancelled) return;
        setJoinRouting(routing);
        setJoinEntryLabel(
          formatJoinEntryGuideLabel(routing, { loading: false })
        );
      })
      .catch(() => {
        if (!cancelled) {
          setJoinRouting(null);
          setJoinEntryLabel(formatJoinEntryGuideLabel(null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const payoutSummary = seasonZeroPayoutSummary({
    indexedPoolYocto,
    participantCount: Math.max(participantCount, myStanding ? 1 : 0),
    participants: payoutParticipants ?? undefined,
    personalAccountId: personalAccountId ?? myStanding?.accountId ?? null,
    routing: joinRouting
      ? {
          joinAmountYocto: joinRouting.joinMinAmountYocto,
          seasonPoolBps: joinRouting.config.season_pool_bps,
        }
      : undefined,
  });

  const activeBuckets = myStanding
    ? SEASON_ZERO_SCORE_BUCKETS.filter(
        ({ key }) => myStanding.breakdown[key] > 0
      )
    : [];

  return (
    <div className={cn('space-y-4', className)}>
      {myStanding ? (
        <div className="space-y-3">
          <p className="portal-eyebrow text-muted-foreground">Your score</p>
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
              Join pts only so far — grow profile and social activity to add
              more.
            </p>
          )}
        </div>
      ) : (
        <p className="portal-type-caption text-muted-foreground/70">
          Up to ~{formatScore(limits.totalMax)} pts when you join and stay
          active.
        </p>
      )}

      <div
        className={cn(
          'space-y-2',
          myStanding && 'border-t border-fade-detail pt-4'
        )}
      >
        <p className="portal-eyebrow text-muted-foreground">How to earn</p>
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

      <div className="space-y-2 border-t border-fade-detail pt-4">
        <p className="portal-eyebrow text-muted-foreground">Rewards</p>
        <ul className="space-y-1.5">
          <GuidePoint label="Entry" value={joinEntryLabel} />
          <GuidePoint label="Split" value="50% equal · 50% by activity" />
          {payoutSummary ? (
            <GuidePoint label="Est. collect" value={payoutSummary} />
          ) : null}
          <GuidePoint label="Collect" value="On this page when open" />
        </ul>
        <p className="portal-type-caption text-muted-foreground/65">
          Compete for rank and a {profileBadgeLabel} profile badge. Most of your
          entry returns from the shared pool; higher ranks earn a larger bonus
          slice.
        </p>
      </div>

      <p className="portal-type-caption text-muted-foreground/65">
        Others endorsing or standing with you raises your score. Stands and
        endorsements count only for connections that did not exist before the
        rally started. Activity after you join may take a few minutes to index.
      </p>
    </div>
  );
}

export function seasonZeroRulesHeaderHint(
  limits: SeasonZeroScoringLimits,
  myStanding: Pick<SeasonZeroStanding, 'rank' | 'score'> | null
): string {
  return myStanding
    ? 'How points work'
    : `Up to ~${formatScore(limits.totalMax)} pts`;
}
