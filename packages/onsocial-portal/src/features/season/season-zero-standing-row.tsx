'use client';

import Link from 'next/link';
import { StandingAvatarFrame } from '@/components/ui/standing-rank-mark';
import {
  profileListResultRowClass,
  profileListResultRowShellClass,
} from '@/features/profile/profile-list-row';
import { cleanHandle } from '@/lib/endorsements';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { getPortalProfileUrl } from '@/lib/portal-config';
import {
  STANDING_RANK_FOCUS_RING_CLASS,
  STANDING_RANK_MIX_BAR_SUBTLE_CLASS,
  STANDING_RANK_SCORE_CLASS,
  standingRankTone,
  type StandingRankTone,
} from '@/lib/standing-rank-tone';
import {
  RALLY_LINE_BOX_CAPTION,
  RALLY_LINE_BOX_LEAD,
  RALLY_LINE_BOX_SCORE,
  SEASON_STANDING_DETAIL_BLOCK_CLASS,
  SEASON_STANDING_MIX_BAR_SKELETON_CLASS,
  SEASON_STANDING_REWARD_RESERVE_CLASS,
  SEASON_STANDING_REWARD_ROW_CLASS,
  SEASON_STANDING_ROW_SHELL_MIN_CLASS,
  SEASON_STANDING_SCORE_COLUMN_CLASS,
  SEASON_STANDING_SCORE_MIX_BAR_ROW_CLASS,
  SEASON_STANDING_SCORE_MIX_ROW_CLASS,
  resolveStandingHeadRowMinClass,
} from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

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

function StandingDetailBlock({ children }: { children: ReactNode }) {
  return (
    <div className={cn('mt-0.5', SEASON_STANDING_DETAIL_BLOCK_CLASS)}>
      {children}
    </div>
  );
}

function StandingDetailSkeleton() {
  return (
    <StandingDetailContent
      handle=""
      signalLine={null}
      standing={EMPTY_STANDING}
      rankTone="neutral"
      loading
    />
  );
}

const EMPTY_STANDING: SeasonZeroStanding = {
  rank: 0,
  accountId: '',
  joinedAtNs: '0',
  joinAmountYocto: '0',
  joinCount: 0,
  eligible: false,
  score: 0,
  breakdown: {
    join: 0,
    profile: 0,
    endorsements: 0,
    solidarity: 0,
    support: 0,
    boost: 0,
    total: 0,
  },
  profile: {
    hasName: false,
    hasBio: false,
    hasAvatar: false,
    linkCount: 0,
  },
  signals: {
    uniqueEndorsers: 0,
    endorsementTopics: 0,
    receivedStands: 0,
    mutualStands: 0,
    supportReceivedYocto: '0',
    effectiveBoostYocto: '0',
  },
};

function StandingDetailContent({
  handle,
  signalLine,
  standing,
  rankTone,
  loading = false,
}: {
  handle: string;
  signalLine: string | null;
  standing: SeasonZeroStanding;
  rankTone: StandingRankTone;
  loading?: boolean;
}) {
  return (
    <StandingDetailBlock>
      <StandingSignalLine
        handle={handle}
        signalLine={signalLine}
        loading={loading}
      />
      <ScoreMix standing={standing} rankTone={rankTone} loading={loading} />
    </StandingDetailBlock>
  );
}

function StandingHeadRow({
  reserveRewardSlot,
  name,
  scoreColumn,
}: {
  reserveRewardSlot: boolean;
  name: ReactNode;
  scoreColumn: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        resolveStandingHeadRowMinClass(reserveRewardSlot)
      )}
    >
      {name}
      {scoreColumn}
    </div>
  );
}

function ScoreMix({
  standing,
  rankTone,
  loading = false,
}: {
  standing: SeasonZeroStanding;
  rankTone: StandingRankTone;
  loading?: boolean;
}) {
  const activeBuckets = SCORE_LABELS.filter(
    (key) => standing.breakdown[key] > 0
  );
  const total = standing.breakdown.total || standing.score || 1;
  const showBar = !loading && activeBuckets.length >= 2;
  const hideMixRow = !loading && activeBuckets.length === 0;

  return (
    <div className="mt-1">
      <div
        className={cn(
          '-mx-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          SEASON_STANDING_SCORE_MIX_ROW_CLASS
        )}
      >
        <RallyTextSlot
          lineClass={cn(
            RALLY_LINE_BOX_CAPTION,
            'whitespace-nowrap px-0.5',
            hideMixRow && 'invisible'
          )}
          loading={loading}
          pulseClass="h-[1em] w-36 max-w-full"
          aria-hidden={hideMixRow}
        >
          {activeBuckets.map((key, index) => (
            <span key={key}>
              {index > 0 ? (
                <span className="px-1.5 text-muted-foreground/25">·</span>
              ) : null}
              <span className="text-muted-foreground/60">
                {scoreBucketLabel(key)}
              </span>{' '}
              <span className="font-mono font-semibold tabular-nums text-foreground/85">
                {formatScore(standing.breakdown[key])}
              </span>
            </span>
          ))}
        </RallyTextSlot>
      </div>
      <div
        className={cn(
          SEASON_STANDING_SCORE_MIX_BAR_ROW_CLASS,
          !showBar && !loading && 'invisible',
          loading && SEASON_STANDING_MIX_BAR_SKELETON_CLASS
        )}
        aria-hidden={!showBar && !loading}
      >
        {showBar
          ? activeBuckets.map((key) => {
              const pct = Math.max(0, (standing.breakdown[key] / total) * 100);
              return (
                <div
                  key={key}
                  className={cn(
                    'h-full',
                    STANDING_RANK_MIX_BAR_SUBTLE_CLASS[rankTone]
                  )}
                  style={{ width: `${pct}%` }}
                  title={`${scoreBucketLabel(key)}: ${formatScore(standing.breakdown[key])}`}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

function StandingSignalLine({
  handle,
  signalLine,
  loading = false,
}: {
  handle: string;
  signalLine: string | null;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        '-mx-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      )}
    >
      <RallyTextSlot
        lineClass={cn(RALLY_LINE_BOX_CAPTION, 'whitespace-nowrap px-0.5')}
        loading={loading}
        pulseClass="h-[1em] w-full max-w-[14rem]"
      >
        <span className="font-mono text-muted-foreground/50">@{handle}</span>
        {signalLine ? (
          <>
            <span className="px-1.5 text-muted-foreground/20">·</span>
            <span className="text-muted-foreground/55">{signalLine}</span>
          </>
        ) : null}
      </RallyTextSlot>
    </div>
  );
}

function StandingScoreColumn({
  rankTone,
  score,
  showRewardRow,
  rewardAmountYocto,
  rewardSlotLoading,
  loading = false,
}: {
  rankTone: StandingRankTone;
  score: number;
  showRewardRow: boolean;
  rewardAmountYocto: string | null;
  rewardSlotLoading: boolean;
  loading?: boolean;
}) {
  const showRewardAmount =
    rewardAmountYocto != null && BigInt(rewardAmountYocto) > 0n;

  return (
    <div className={SEASON_STANDING_SCORE_COLUMN_CLASS}>
      <RallyTextSlot
        lineClass={cn(
          RALLY_LINE_BOX_SCORE,
          STANDING_RANK_SCORE_CLASS[rankTone]
        )}
        loading={loading}
        pulseClass="h-[1em] w-14"
      >
        <span className="font-bold">
          {formatScore(score)}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground/60">
            pts
          </span>
        </span>
      </RallyTextSlot>
      {showRewardRow ? (
        <StandingRewardSlot
          amountYocto={showRewardAmount ? rewardAmountYocto : null}
          loading={loading || (!showRewardAmount && rewardSlotLoading)}
        />
      ) : null}
    </div>
  );
}
function StandingRewardSlot({
  amountYocto = null,
  loading = false,
}: {
  amountYocto?: string | null;
  loading?: boolean;
}) {
  const showAmount = amountYocto != null && BigInt(amountYocto) > 0n;

  return (
    <RallyTextSlot
      lineClass={cn(
        SEASON_STANDING_REWARD_ROW_CLASS,
        'portal-green-text justify-end'
      )}
      loading={loading && !showAmount}
      pulseClass={cn(
        SEASON_STANDING_REWARD_RESERVE_CLASS,
        'h-[1em] rounded-full'
      )}
    >
      {showAmount ? (
        <>
          {formatGenesisSocialBalanceDisplay(amountYocto!)}
          <span className="ml-1">SOCIAL</span>
        </>
      ) : (
        <span className={SEASON_STANDING_REWARD_RESERVE_CLASS} aria-hidden />
      )}
    </RallyTextSlot>
  );
}

function StandingNameRow({
  loading = false,
  interactive = true,
  profileHref,
  label,
  viewerTag,
}: {
  loading?: boolean;
  interactive?: boolean;
  profileHref?: string;
  label?: ReactNode;
  viewerTag?: ReactNode;
}) {
  return (
    <RallyTextSlot
      lineClass={cn(
        RALLY_LINE_BOX_LEAD,
        'min-w-0 flex-1 font-medium text-foreground'
      )}
      loading={loading}
      pulseClass="h-[1em] w-36 max-w-full"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {interactive && profileHref ? (
          <Link
            href={profileHref}
            prefetch
            className="min-w-0 truncate hover:underline"
          >
            {label}
          </Link>
        ) : (
          <span className="min-w-0 truncate">{label}</span>
        )}
        {viewerTag}
      </div>
    </RallyTextSlot>
  );
}

export function StandingRowSkeleton({
  reserveRewardSlot = false,
  rewardSlotLoading = false,
}: {
  /** Keep reward row height — use invisible space unless loading. */
  reserveRewardSlot?: boolean;
  /** When true, pulse skeleton inside the reserved slot. */
  rewardSlotLoading?: boolean;
} = {}) {
  return (
    <div
      className={cn(
        profileListResultRowShellClass,
        'items-start py-2.5',
        SEASON_STANDING_ROW_SHELL_MIN_CLASS
      )}
    >
      <div className="relative h-9 w-9 shrink-0" aria-hidden>
        <div className="h-9 w-9 animate-pulse rounded-full bg-foreground/[0.06]" />
        <div className="absolute bottom-0 left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-px animate-pulse rounded-full bg-foreground/[0.06]" />
      </div>
      <div className="min-w-0 flex-1">
        <StandingHeadRow
          reserveRewardSlot={reserveRewardSlot}
          name={<StandingNameRow loading />}
          scoreColumn={
            <StandingScoreColumn
              rankTone="neutral"
              score={0}
              showRewardRow={reserveRewardSlot}
              rewardAmountYocto={null}
              rewardSlotLoading={rewardSlotLoading}
              loading
            />
          }
        />
        <StandingDetailSkeleton />
      </div>
    </div>
  );
}

export function StandingRow({
  standing,
  interactive = true,
  isViewer = false,
  pulse = false,
  rewardAmountYocto = null,
  reserveRewardSlot = false,
  rewardSlotLoading = false,
  className,
}: {
  standing: SeasonZeroStanding;
  /** When false, renders a static preview (e.g. home promo card) without profile links. */
  interactive?: boolean;
  /** Marks the connected wallet's row in the standings list. */
  isViewer?: boolean;
  /** Brief background flash after scroll-to-row (no border). */
  pulse?: boolean;
  /** Final published reward amount (yocto). Shown only after settlement publish. */
  rewardAmountYocto?: string | null;
  /** @deprecated Reward emphasis is fixed size/weight in the score column. */
  rewardProminent?: boolean;
  /** Keep reward row height before amount resolves. */
  reserveRewardSlot?: boolean;
  /** Pulse skeleton inside the slot — only when a reward is expected soon. */
  rewardSlotLoading?: boolean;
  className?: string;
}) {
  const profileHref = getPortalProfileUrl(standing.accountId);
  const handle = cleanHandle(standing.accountId);
  const signalLine = standingSignalLine(standing);
  const rankTone = standingRankTone(standing.rank);
  const label = standingLabel(standing);
  const showRewardAmount =
    rewardAmountYocto != null && BigInt(rewardAmountYocto) > 0n;
  const showRewardRow = showRewardAmount || reserveRewardSlot;

  const avatarFrame = (
    <StandingAvatarFrame
      avatarUrl={standing.avatarUrl ?? null}
      rank={standing.rank}
    />
  );

  const nameLabel = (
    <span className="truncate portal-type-lead font-medium text-foreground">
      {label}
    </span>
  );

  const viewerTag = isViewer ? (
    <span className="shrink-0 portal-type-micro font-medium text-muted-foreground/55">
      You
    </span>
  ) : null;

  return (
    <div
      data-standing-account={standing.accountId}
      data-standing-rank={standing.rank}
      className={cn(
        interactive
          ? profileListResultRowClass
          : profileListResultRowShellClass,
        'group/row items-start',
        SEASON_STANDING_ROW_SHELL_MIN_CLASS,
        pulse && 'standing-row-pulse',
        className
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
        <StandingHeadRow
          reserveRewardSlot={showRewardRow}
          name={
            <StandingNameRow
              interactive={interactive}
              profileHref={interactive ? profileHref : undefined}
              label={nameLabel}
              viewerTag={viewerTag}
            />
          }
          scoreColumn={
            <StandingScoreColumn
              rankTone={rankTone}
              score={standing.score}
              showRewardRow={showRewardRow}
              rewardAmountYocto={rewardAmountYocto}
              rewardSlotLoading={rewardSlotLoading}
            />
          }
        />
        <StandingDetailContent
          handle={handle}
          signalLine={signalLine}
          standing={standing}
          rankTone={rankTone}
        />
      </div>
    </div>
  );
}
