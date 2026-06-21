'use client';

import type { ComponentType, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock, Coins, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { SeasonCountdownLabel } from '@/features/season/season-countdown-label';
import {
  RallyPoolBreakdown,
  rallyPoolBreakdownVisible,
} from '@/features/season/rally-pool-breakdown';
import type { SeasonZeroClaimMetricsStatus } from '@/features/season/season-zero-claim-copy';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  type SeasonTreasurySeedSource,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { useSeasonZeroLifecyclePhase } from '@/features/season/use-season-zero-lifecycle-phase';
import { readTimestampNs } from '@/lib/relative-duration';
import { resolveTreasurySeedHref } from '@/lib/season-treasury-seed';
import { fadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

const PHASE_COPY: Record<
  NonNullable<ReturnType<typeof useSeasonZeroLifecyclePhase>>,
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
  if (statusLabel === 'Collected') {
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

function MetricsRailFooterSkeleton() {
  return (
    <div
      className="border-t border-fade-detail px-4 py-3 text-center md:px-5 md:py-3.5"
      aria-hidden
    >
      <Skeleton className="mx-auto h-3.5 w-40 max-w-full rounded-full bg-foreground/[0.06]" />
      <Skeleton className="mx-auto mt-2 h-3 w-52 max-w-full rounded-full bg-foreground/[0.05]" />
    </div>
  );
}

function MetricsRailFooter({
  claimStatus,
  settlement,
  showSettlementDetail = false,
}: {
  claimStatus?: SeasonZeroClaimMetricsStatus | null;
  settlement?: SeasonZeroSettlementSummary | null;
  showSettlementDetail?: boolean;
}) {
  if (!claimStatus && !(showSettlementDetail && settlement)) return null;

  const statusHref = claimStatus?.statusHref ?? null;
  const statusLabel = claimStatus?.statusLabel ?? '';

  return (
    <div className="border-t border-fade-section px-4 py-3 text-center md:px-5 md:py-3.5">
      {claimStatus ? (
        <>
          <p className="portal-eyebrow text-muted-foreground">
            Season claim
            <span className="text-muted-foreground/40"> · </span>
            {statusHref ? (
              <a
                href={statusHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group/status inline-flex items-center gap-1 rounded-sm underline-offset-2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-gold-accent)]',
                  claimStatusAccentClass(statusLabel)
                )}
                aria-label={`View ${statusLabel.toLowerCase()} transaction on Nearblocks`}
              >
                <span>{statusLabel}</span>
                <ProtocolMotionArrow className="h-3 w-3" />
              </a>
            ) : (
              <span className={claimStatusAccentClass(statusLabel)}>
                {statusLabel}
              </span>
            )}
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

const METRIC_ICON_FRAME = {
  default: 'h-7 w-7 sm:h-8 sm:w-8',
  featured: 'h-9 w-9 sm:h-10 sm:w-10',
} as const;

const METRIC_ICON_SIZE = {
  default: 'h-3.5 w-3.5',
  featured: 'h-4 w-4 sm:h-[18px] sm:w-[18px]',
} as const;

function MetricSegment({
  icon: Icon,
  iconClassName,
  frameClassName,
  children,
  iconPulse = false,
  iconScale = 'default',
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  frameClassName: string;
  children: ReactNode;
  iconPulse?: boolean;
  /** Featured clock — larger icon anchor in the horizontal rail. */
  iconScale?: keyof typeof METRIC_ICON_FRAME;
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 px-2 py-2.5 sm:gap-2.5 sm:px-3 md:px-4 md:py-3">
      <div className="relative shrink-0">
        {iconPulse ? (
          <span
            className="absolute inset-0 rounded-full bg-[var(--portal-gold)]/20 motion-safe:animate-ping"
            aria-hidden
          />
        ) : null}
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full border',
            METRIC_ICON_FRAME[iconScale],
            frameClassName
          )}
        >
          <Icon
            className={cn(METRIC_ICON_SIZE[iconScale], iconClassName)}
          />
        </div>
      </div>
      <div className="min-w-0 text-left">{children}</div>
    </div>
  );
}

export function SeasonZeroMetricsRail({
  onChainConfig,
  indexedPoolYocto,
  joinPoolYocto,
  sponsoredPoolYocto,
  joinRouting,
  protocolFeesRouteToBoost = false,
  settlement,
  participantCount = 0,
  claimStatus = null,
  claimStatusPending = false,
  showSettlementDetail = false,
  hideClaimFooter = false,
  treasurySeedSource = null,
  className,
}: {
  onChainConfig: SeasonZeroOnChainConfig;
  indexedPoolYocto?: string;
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  joinRouting?: {
    season_pool_bps: number;
    burn_bps: number;
    treasury_bps: number;
  } | null;
  protocolFeesRouteToBoost?: boolean;
  settlement?: SeasonZeroSettlementSummary | null;
  participantCount?: number;
  claimStatus?: SeasonZeroClaimMetricsStatus | null;
  claimStatusPending?: boolean;
  /** Ops/admin only — hides jargon like "Settlement finalized" from participants by default. */
  showSettlementDetail?: boolean;
  /** Page hero renders claim UI in RallyCollectSection instead of the metrics footer. */
  hideClaimFooter?: boolean;
  treasurySeedSource?: SeasonTreasurySeedSource | null;
  className?: string;
}) {
  const phase = useSeasonZeroLifecyclePhase(onChainConfig, settlement) ?? 'upcoming';
  const copy = PHASE_COPY[phase];
  const endsAtNs = readEndsAtNs(onChainConfig);
  const startsAtNs = readStartsAtNs(onChainConfig);
  const isLive = phase === 'live';
  const isUpcoming = phase === 'upcoming';
  const poolLabel = formatGenesisSocialBalanceDisplay(indexedPoolYocto ?? '0');
  const reduceMotion = useReducedMotion();
  const showBreakdown = rallyPoolBreakdownVisible({
    joinPoolYocto,
    sponsoredPoolYocto,
    joinRouting,
    protocolFeesRouteToBoost,
  });
  const treasurySeedHref = resolveTreasurySeedHref(treasurySeedSource);

  return (
    <div className={className}>
      <div className="grid grid-cols-3 divide-x divide-fade-section">
        <MetricSegment
          icon={Clock}
          iconClassName={ACCENT_ICON[copy.accent]}
          frameClassName={ACCENT_FRAME[copy.accent]}
          iconPulse={isLive}
          iconScale="featured"
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
          <p className="mt-0.5 portal-type-micro text-muted-foreground/65">
            Pool
          </p>
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

      {showBreakdown ? (
        <div className="border-t border-fade-detail px-2 py-2 sm:px-3 md:px-4">
          <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <RallyPoolBreakdown
              layout="strip"
              joinPoolYocto={joinPoolYocto}
              sponsoredPoolYocto={sponsoredPoolYocto}
              joinRouting={joinRouting}
              protocolFeesRouteToBoost={protocolFeesRouteToBoost}
              treasurySeedHref={treasurySeedHref}
              className="mx-auto w-max min-w-0 sm:w-auto"
            />
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {!hideClaimFooter && claimStatusPending ? (
          <motion.div
            key="claim-footer-loading"
            {...fadeMotion(Boolean(reduceMotion) ? 0 : 0.18)}
          >
            <MetricsRailFooterSkeleton />
          </motion.div>
        ) : !hideClaimFooter &&
          (claimStatus || (showSettlementDetail && settlement)) ? (
          <motion.div
            key="claim-footer-ready"
            {...fadeMotion(Boolean(reduceMotion) ? 0 : 0.2)}
          >
            <MetricsRailFooter
              claimStatus={claimStatus}
              settlement={settlement}
              showSettlementDetail={showSettlementDetail}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
