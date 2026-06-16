'use client';

import type { ComponentType, ReactNode } from 'react';
import { Clock, Coins, Users } from 'lucide-react';
import { SeasonCountdownLabel } from '@/features/season/season-countdown-label';
import { formatGenesisYoctoAsSocial } from '@/lib/genesis-season';
import { estimateJoinBurnYocto } from '@/lib/join-rally-routing';
import {
  resolveSeasonZeroLifecyclePhase,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { readTimestampNs } from '@/lib/relative-duration';
import { cn } from '@/lib/utils';

const PHASE_COPY: Record<
  ReturnType<typeof resolveSeasonZeroLifecyclePhase>,
  {
    title: string;
    shortTitle?: string;
    accent: 'gold' | 'blue' | 'green' | 'neutral';
  }
> = {
  upcoming: { title: 'Starting soon', shortTitle: 'Soon', accent: 'blue' },
  live: { title: 'Live', accent: 'gold' },
  ended_pending_settlement: { title: 'Ended', accent: 'blue' },
  finalized_pending_publish: {
    title: 'Finalized',
    shortTitle: 'Final',
    accent: 'blue',
  },
  published_claim_soon: { title: 'Published', accent: 'green' },
  claim_open: { title: 'Claims open', shortTitle: 'Claims', accent: 'green' },
};

function claimStatusAccentClass(statusLabel: string): string {
  if (statusLabel === 'Claimed') {
    return 'portal-gold-text';
  }
  if (statusLabel.endsWith(' SOCIAL')) {
    return 'portal-green-text';
  }
  switch (statusLabel) {
    case 'Reward ready':
    case 'Claims opening soon':
    case 'Rewards finalized':
      return 'portal-green-text';
    case 'Awaiting publish':
    case 'Awaiting settlement':
      return 'portal-blue-text';
    default:
      return 'text-muted-foreground/80';
  }
}

function MetricsRailFooter({
  claimStatus,
  settlement,
  showSettlementDetail = false,
}: {
  claimStatus?: {
    statusLabel: string;
    detailLine?: string | null;
  } | null;
  settlement?: SeasonZeroSettlementSummary | null;
  showSettlementDetail?: boolean;
}) {
  if (!claimStatus && !(showSettlementDetail && settlement)) return null;

  return (
    <div className="border-t border-fade-section px-4 py-3 text-center md:px-5 md:py-3.5">
      {claimStatus ? (
        <>
          <p className="portal-eyebrow text-muted-foreground">
            Season claim
            <span className="text-muted-foreground/40"> · </span>
            <span className={claimStatusAccentClass(claimStatus.statusLabel)}>
              {claimStatus.statusLabel}
            </span>
          </p>
          {claimStatus.detailLine ? (
            <p className="mt-1 text-xs text-muted-foreground/75">
              {claimStatus.detailLine}
            </p>
          ) : null}
        </>
      ) : null}
      {showSettlementDetail && settlement ? (
        <p
          className={cn(
            'portal-type-micro text-muted-foreground/65',
            claimStatus ? 'mt-2' : null
          )}
        >
          Settlement {settlement.status}
          {settlement.publishedTxHash ? ' · root on-chain' : ''}
        </p>
      ) : null}
    </div>
  );
}

const METRIC_VALUE_CLASS =
  'font-mono text-xs font-bold tracking-tight sm:text-sm md:text-base';

const CLOCK_VALUE_CLASS = cn(METRIC_VALUE_CLASS, 'tabular-nums leading-tight');

const ACCENT_ICON: Record<
  (typeof PHASE_COPY)[keyof typeof PHASE_COPY]['accent'],
  string
> = {
  gold: 'portal-gold-icon',
  blue: 'portal-blue-icon',
  green: 'portal-green-icon',
  neutral: 'portal-neutral-icon',
};

const ACCENT_FRAME: Record<
  (typeof PHASE_COPY)[keyof typeof PHASE_COPY]['accent'],
  string
> = {
  gold: 'portal-gold-frame',
  blue: 'portal-blue-frame',
  green: 'portal-green-frame',
  neutral: 'border-border/45 bg-background/40',
};

const ACCENT_VALUE: Record<
  (typeof PHASE_COPY)[keyof typeof PHASE_COPY]['accent'],
  string
> = {
  gold: 'portal-gold-text',
  blue: 'portal-blue-text',
  green: 'portal-green-text',
  neutral: 'text-portal-neutral',
};

function readEndsAtNs(
  onChain: SeasonZeroOnChainConfig | null | undefined
): number {
  return readTimestampNs(onChain?.ends_at_ns);
}

function readStartsAtNs(
  onChain: SeasonZeroOnChainConfig | null | undefined
): number {
  return readTimestampNs(onChain?.starts_at_ns);
}

function formatParticipants(total: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    total
  );
}

function MetricSegment({
  icon: Icon,
  iconClassName,
  frameClassName,
  children,
  showDivider = false,
  iconPulse = false,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  frameClassName: string;
  children: ReactNode;
  showDivider?: boolean;
  iconPulse?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5 md:gap-3 md:px-4',
        showDivider && 'border-r border-fade-section'
      )}
    >
      <div className="relative shrink-0">
        {iconPulse ? (
          <span
            className="absolute inset-0 rounded-full bg-[var(--portal-gold)]/20 motion-safe:animate-ping"
            aria-hidden
          />
        ) : null}
        <div
          className={cn(
            'relative flex h-7 w-7 items-center justify-center rounded-full border sm:h-8 sm:w-8',
            frameClassName
          )}
        >
          <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
        </div>
      </div>
      <div className="min-w-0 shrink text-left">{children}</div>
    </div>
  );
}

function PoolBreakdownSubtitle({
  joinPoolYocto,
  sponsoredPoolYocto,
  joinRoutingBps,
}: {
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  joinRoutingBps?: { season_pool_bps: number; burn_bps: number } | null;
}) {
  const sponsored = BigInt(sponsoredPoolYocto ?? '0');
  const joinLabel = formatGenesisYoctoAsSocial(joinPoolYocto ?? '0');
  const burnYocto =
    joinRoutingBps && joinRoutingBps.burn_bps > 0
      ? estimateJoinBurnYocto(
          joinPoolYocto ?? '0',
          joinRoutingBps.season_pool_bps,
          joinRoutingBps.burn_bps
        )
      : 0n;
  const burnLabel =
    burnYocto > 0n ? formatGenesisYoctoAsSocial(burnYocto.toString()) : null;
  const hasJoinFlow = joinLabel !== '0' || burnLabel;
  const hasTreasurySeed = sponsored > 0n;

  if (!hasJoinFlow && !hasTreasurySeed) {
    return (
      <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
        Reward pool
      </p>
    );
  }

  return (
    <div className="mt-0.5 space-y-0.5">
      {hasJoinFlow ? (
        <p className="portal-type-micro leading-snug text-muted-foreground/65">
          <span className="whitespace-nowrap">{joinLabel} joins</span>
          {burnLabel ? (
            <>
              <span className="text-muted-foreground/35"> · </span>
              <span className="whitespace-nowrap">{burnLabel} burn</span>
            </>
          ) : null}
        </p>
      ) : null}
      {hasTreasurySeed ? (
        <p className="portal-type-micro leading-snug">
          <span className="whitespace-nowrap portal-gold-text">
            <span className="font-mono font-semibold tabular-nums">
              {formatGenesisYoctoAsSocial(sponsoredPoolYocto ?? '0')}
            </span>
            <span className="ml-1 font-medium">Treasury seed</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function SeasonZeroMetricsRail({
  onChainConfig,
  indexedPoolYocto,
  joinPoolYocto,
  sponsoredPoolYocto,
  joinRoutingBps,
  settlement,
  participantCount = 0,
  claimStatus = null,
  showSettlementDetail = false,
  className,
}: {
  onChainConfig: SeasonZeroOnChainConfig;
  indexedPoolYocto?: string;
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  joinRoutingBps?: { season_pool_bps: number; burn_bps: number } | null;
  settlement?: SeasonZeroSettlementSummary | null;
  participantCount?: number;
  claimStatus?: {
    statusLabel: string;
    detailLine?: string | null;
  } | null;
  /** Ops/admin only — hides jargon like "Settlement finalized" from participants by default. */
  showSettlementDetail?: boolean;
  className?: string;
}) {
  const phase = resolveSeasonZeroLifecyclePhase(onChainConfig, settlement);
  const copy = PHASE_COPY[phase];
  const endsAtNs = readEndsAtNs(onChainConfig);
  const startsAtNs = readStartsAtNs(onChainConfig);
  const isLive = phase === 'live';
  const isUpcoming = phase === 'upcoming';
  const poolLabel = formatGenesisYoctoAsSocial(indexedPoolYocto ?? '0');

  return (
    <div className={className}>
      <div className="flex items-stretch">
        <MetricSegment
          icon={Clock}
          iconClassName={ACCENT_ICON[copy.accent]}
          frameClassName={ACCENT_FRAME[copy.accent]}
          showDivider
          iconPulse={isLive}
        >
          <p
            className={cn(
              CLOCK_VALUE_CLASS,
              isLive ? ACCENT_VALUE.gold : ACCENT_VALUE[copy.accent]
            )}
          >
            {isUpcoming && startsAtNs > 0 ? (
              <SeasonCountdownLabel targetNs={startsAtNs} compact />
            ) : isLive && endsAtNs > 0 ? (
              <SeasonCountdownLabel targetNs={endsAtNs} compact />
            ) : (
              <>
                <span className="sm:hidden">
                  {copy.shortTitle ?? copy.title}
                </span>
                <span className="hidden sm:inline">{copy.title}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
            {isUpcoming ? 'Opens in' : isLive ? 'Ends in' : 'Season clock'}
          </p>
        </MetricSegment>

        <MetricSegment
          icon={Coins}
          iconClassName="portal-gold-icon"
          frameClassName="portal-gold-frame"
          showDivider
        >
          <p
            className={cn(
              METRIC_VALUE_CLASS,
              'flex items-baseline gap-1.5 text-foreground'
            )}
          >
            <span className="truncate tabular-nums">{poolLabel}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75 sm:text-[11px]">
              Social
            </span>
          </p>
          <PoolBreakdownSubtitle
            joinPoolYocto={joinPoolYocto}
            sponsoredPoolYocto={sponsoredPoolYocto}
            joinRoutingBps={joinRoutingBps}
          />
        </MetricSegment>

        <MetricSegment
          icon={Users}
          iconClassName="portal-purple-icon"
          frameClassName="portal-purple-frame"
        >
          <p className={cn(METRIC_VALUE_CLASS, 'text-foreground')}>
            {formatParticipants(participantCount)}
          </p>
          <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
            In the rally
          </p>
        </MetricSegment>
      </div>

      {claimStatus || (showSettlementDetail && settlement) ? (
        <MetricsRailFooter
          claimStatus={claimStatus}
          settlement={settlement}
          showSettlementDetail={showSettlementDetail}
        />
      ) : null}
    </div>
  );
}
