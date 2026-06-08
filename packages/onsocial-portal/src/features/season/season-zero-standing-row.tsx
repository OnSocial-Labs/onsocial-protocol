'use client';

import Link from 'next/link';
import { StandingAvatarFrame } from '@/components/ui/standing-rank-mark';
import { profileListResultRowShellClass } from '@/features/profile/profile-list-row';
import { cleanHandle } from '@/lib/endorsements';
import { getPortalProfileUrl } from '@/lib/portal-config';
import {
  STANDING_RANK_FOCUS_RING_CLASS,
  STANDING_RANK_MIX_BAR_CLASS,
  STANDING_RANK_SCORE_CLASS,
  standingRankTone,
  type StandingRankTone,
} from '@/lib/standing-rank-tone';
import { cn } from '@/lib/utils';

export interface SeasonZeroStanding {
  rank: number;
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  joinedAtNs: string;
  joinAmountYocto: string;
  joinCount: number;
  eligible: boolean;
  score: number;
  breakdown: {
    join: number;
    profile: number;
    endorsements: number;
    solidarity: number;
    support: number;
    boost: number;
    total: number;
  };
  profile: {
    hasName: boolean;
    hasBio: boolean;
    hasAvatar: boolean;
    linkCount: number;
  };
  signals: {
    uniqueEndorsers: number;
    endorsementTopics: number;
    receivedStands: number;
    mutualStands: number;
    supportReceivedYocto: string;
    effectiveBoostYocto: string;
  };
}

type ScoreBucketKey = Exclude<keyof SeasonZeroStanding['breakdown'], 'total'>;

const SCORE_LABELS: ScoreBucketKey[] = [
  'join',
  'profile',
  'endorsements',
  'solidarity',
  'support',
  'boost',
];

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  );
}

function scoreBucketLabel(key: ScoreBucketKey): string {
  switch (key) {
    case 'join':
      return 'Join';
    case 'profile':
      return 'Profile';
    case 'endorsements':
      return 'Endorse';
    case 'solidarity':
      return 'Stand';
    case 'support':
      return 'Support';
    case 'boost':
      return 'Boost';
  }
}

function standingLabel(standing: SeasonZeroStanding): string {
  return standing.displayName?.trim() || cleanHandle(standing.accountId);
}

function standingSignalLine(standing: SeasonZeroStanding): string | null {
  const { uniqueEndorsers, receivedStands, mutualStands } = standing.signals;
  const hasSignals =
    uniqueEndorsers > 0 || receivedStands > 0 || mutualStands > 0;

  if (!hasSignals) return null;

  return `${uniqueEndorsers} endorsers · ${receivedStands} stand with · ${mutualStands} mutual`;
}

function ScoreMix({
  standing,
  rankTone,
}: {
  standing: SeasonZeroStanding;
  rankTone: StandingRankTone;
}) {
  const activeBuckets = SCORE_LABELS.filter(
    (key) => standing.breakdown[key] > 0
  );
  if (activeBuckets.length === 0) return null;

  const total = standing.breakdown.total || standing.score || 1;

  return (
    <div className="mt-1">
      {activeBuckets.length > 2 ? (
        <div
          className="mb-1 flex h-px overflow-hidden rounded-full bg-border/30"
          aria-hidden
        >
          {activeBuckets.map((key) => {
            const pct = Math.max(0, (standing.breakdown[key] / total) * 100);
            return (
              <div
                key={key}
                className={cn('h-full', STANDING_RANK_MIX_BAR_CLASS[rankTone])}
                style={{ width: `${pct}%` }}
                title={`${scoreBucketLabel(key)}: ${formatScore(standing.breakdown[key])}`}
              />
            );
          })}
        </div>
      ) : null}
      <div className="-mx-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="whitespace-nowrap px-0.5 portal-type-caption">
          {activeBuckets.map((key, index) => (
            <span key={key}>
              {index > 0 ? (
                <span className="px-1.5 text-muted-foreground/25">·</span>
              ) : null}
              <span className="text-muted-foreground/65">
                {scoreBucketLabel(key)}
              </span>{' '}
              <span className="font-mono text-xs font-semibold tabular-nums text-foreground/90">
                {formatScore(standing.breakdown[key])}
              </span>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

export function StandingRowSkeleton() {
  return (
    <div
      className={cn(
        profileListResultRowShellClass,
        'items-center gap-2.5 py-2.5'
      )}
    >
      <div className="relative h-9 w-9 shrink-0" aria-hidden>
        <div className="h-9 w-9 animate-pulse rounded-full bg-foreground/[0.06]" />
        <div className="absolute bottom-0 left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-px animate-pulse rounded-full bg-foreground/[0.06]" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-36 animate-pulse rounded-full bg-foreground/[0.06]" />
        <div className="h-3 w-52 max-w-full animate-pulse rounded-full bg-foreground/[0.06]" />
      </div>
    </div>
  );
}

export function StandingRow({
  standing,
  interactive = true,
}: {
  standing: SeasonZeroStanding;
  /** When false, renders a static preview (e.g. home promo card) without profile links. */
  interactive?: boolean;
}) {
  const profileHref = getPortalProfileUrl(standing.accountId);
  const handle = cleanHandle(standing.accountId);
  const signalLine = standingSignalLine(standing);
  const rankTone = standingRankTone(standing.rank);
  const label = standingLabel(standing);

  const avatarFrame = (
    <StandingAvatarFrame
      avatarUrl={standing.avatarUrl ?? null}
      rank={standing.rank}
    />
  );

  const nameLabel = (
    <span className="block truncate portal-type-lead font-medium text-foreground">
      {label}
    </span>
  );

  return (
    <div
      className={cn(
        profileListResultRowShellClass,
        'group/row items-center gap-2.5 py-2.5'
      )}
    >
      {interactive ? (
        <Link
          href={profileHref}
          prefetch
          className={cn(
            'shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            STANDING_RANK_FOCUS_RING_CLASS[rankTone]
          )}
          aria-label={`Open ${label}`}
        >
          {avatarFrame}
        </Link>
      ) : (
        <div className="shrink-0" aria-hidden>
          {avatarFrame}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          {interactive ? (
            <Link
              href={profileHref}
              prefetch
              className="min-w-0 hover:underline"
            >
              {nameLabel}
            </Link>
          ) : (
            <div className="min-w-0">{nameLabel}</div>
          )}
          <span
            className={cn(
              'shrink-0 pt-0.5 font-mono text-sm font-bold leading-none tabular-nums tracking-tight',
              STANDING_RANK_SCORE_CLASS[rankTone]
            )}
          >
            {formatScore(standing.score)}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground/60">
              pts
            </span>
          </span>
        </div>

        <p className="mt-0.5 truncate portal-type-caption">
          <span className="font-mono text-muted-foreground/50">@{handle}</span>
          {signalLine ? (
            <>
              <span className="px-1.5 text-muted-foreground/20">·</span>
              <span className="text-muted-foreground/55">{signalLine}</span>
            </>
          ) : null}
        </p>

        <ScoreMix standing={standing} rankTone={rankTone} />
      </div>
    </div>
  );
}
