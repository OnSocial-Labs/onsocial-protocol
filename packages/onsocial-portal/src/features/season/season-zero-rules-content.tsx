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
  formatJoinRoutingDisclosure,
} from '@/lib/join-rally-routing';
import {
  seasonZeroPayoutSummaryLines,
  seasonZeroPoolSplitRulesLabel,
} from '@/features/season/season-zero-payout-copy';
import { compactModalInsetShellPadClass } from '@/components/ui/floating-panel';
import { cn } from '@/lib/utils';

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
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

  const payoutSummary = seasonZeroPayoutSummaryLines({
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

  const entryLine = joinRouting
    ? (() => {
        const routing = formatJoinRoutingDisclosure(joinRouting);
        return routing
          ? `${joinRouting.joinMinAmountSocialLabel} SOCIAL · ${routing}`
          : `${joinRouting.joinMinAmountSocialLabel} SOCIAL`;
      })()
    : joinEntryLabel;

  const breakdown = myStanding?.breakdown ?? null;

  return (
    <div className={cn('space-y-0', className)}>
      <div
        className={cn(
          'rounded-xl bg-background/35',
          compactModalInsetShellPadClass
        )}
      >
        <div className="grid grid-cols-1 gap-1.5">
          {SEASON_ZERO_SCORE_BUCKETS.map(({ key, label }) => (
            <SeasonZeroProgressRow
              key={key}
              label={label}
              value={breakdown?.[key] ?? 0}
              max={seasonZeroBucketMax[key](limits)}
              inline
            />
          ))}
        </div>
      </div>

      <div
        className="mt-3 space-y-1.5 border-t border-fade-section pt-2.5"
        role="group"
        aria-label="Pool and rewards"
      >
        <p className="portal-type-label leading-snug text-muted-foreground/75">
          {entryLine}
        </p>
        <p className="portal-type-label leading-snug text-muted-foreground/75">
          {seasonZeroPoolSplitRulesLabel}
        </p>
        <p className="portal-type-label leading-snug text-muted-foreground/75">
          {profileBadgeLabel} badge
        </p>
        {payoutSummary?.personal ? (
          <p className="portal-type-label leading-snug text-muted-foreground/65">
            {payoutSummary.personal}
          </p>
        ) : null}
        {payoutSummary?.field ? (
          <p className="portal-type-label leading-snug text-muted-foreground/65">
            {payoutSummary.field}
          </p>
        ) : null}
        <p className="portal-type-caption leading-snug text-muted-foreground/55">
          Endorse & stand: daily caps on new connections since rally start
        </p>
      </div>
    </div>
  );
}

export function seasonZeroRulesHeaderHint(
  limits: SeasonZeroScoringLimits,
  myStanding: Pick<SeasonZeroStanding, 'rank' | 'score'> | null
): string {
  if (myStanding) {
    return `${formatScore(myStanding.score)} pts`;
  }

  return `Up to ~${formatScore(limits.totalMax)} pts`;
}
