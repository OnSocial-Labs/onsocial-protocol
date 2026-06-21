'use client';

import type { ReactNode } from 'react';
import { SeasonCountdownLabel } from '@/features/season/season-countdown-label';
import {
  RallyPoolBreakdown,
  rallyPoolBreakdownVisible,
} from '@/features/season/rally-pool-breakdown';
import { SEASON_PULSE_VALUE_ROW_CLASS } from '@/features/season/season-page-column';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  resolveSeasonZeroLifecyclePhase,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { readTimestampNs } from '@/lib/relative-duration';
import { cn } from '@/lib/utils';

const PHASE_COPY: Record<
  ReturnType<typeof resolveSeasonZeroLifecyclePhase>,
  { title: string; shortTitle?: string }
> = {
  upcoming: { title: 'Starting soon', shortTitle: 'Soon' },
  live: { title: 'Live' },
  ended_pending_settlement: { title: 'Ended' },
  finalized_pending_publish: { title: 'Finalized', shortTitle: 'Final' },
  published_claim_soon: { title: 'Published' },
  claim_open: { title: 'Claims open', shortTitle: 'Claims' },
};

function PulseDivider() {
  return (
    <span
      aria-hidden
      className="hidden h-4 w-px shrink-0 bg-border/50 sm:block"
    />
  );
}

function PulseItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-[4.5rem] flex-1 flex-col items-center text-center sm:min-w-0">
      <span className="portal-type-micro text-muted-foreground/70">
        {label}
      </span>
      <div className={SEASON_PULSE_VALUE_ROW_CLASS}>
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums tracking-tight',
            valueClassName ?? 'text-foreground'
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function formatParticipants(total: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    total
  );
}

export function SeasonRallyPulse({
  onChainConfig,
  indexedPoolYocto,
  joinPoolYocto,
  sponsoredPoolYocto,
  joinRouting,
  protocolFeesRouteToBoost = false,
  settlement,
  participantCount = 0,
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
  className?: string;
}) {
  const phase = resolveSeasonZeroLifecyclePhase(onChainConfig, settlement);
  const copy = PHASE_COPY[phase];
  const endsAtNs = readTimestampNs(onChainConfig.ends_at_ns);
  const startsAtNs = readTimestampNs(onChainConfig.starts_at_ns);
  const isLive = phase === 'live';
  const isUpcoming = phase === 'upcoming';
  const poolLabel = formatGenesisSocialBalanceDisplay(indexedPoolYocto ?? '0');
  const showBreakdown = rallyPoolBreakdownVisible({
    joinPoolYocto,
    sponsoredPoolYocto,
    joinRouting,
    protocolFeesRouteToBoost,
  });

  const clockLabel = isUpcoming ? 'Opens in' : isLive ? 'Ends in' : 'Status';
  const clockValue =
    isUpcoming && startsAtNs > 0 ? (
      <SeasonCountdownLabel targetNs={startsAtNs} compact />
    ) : isLive && endsAtNs > 0 ? (
      <SeasonCountdownLabel targetNs={endsAtNs} compact />
    ) : (
      (copy.shortTitle ?? copy.title)
    );

  return (
    <div
      className={cn(
        'border-b border-fade-detail px-3 py-2.5 sm:px-3.5',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between sm:gap-2">
        <PulseItem
          label={clockLabel}
          value={clockValue}
          valueClassName={isLive ? 'portal-gold-text' : undefined}
        />
        <PulseDivider />
        <PulseItem
          label="Pool"
          value={poolLabel}
          valueClassName="text-foreground"
        />
        <PulseDivider />
        <PulseItem
          label="In rally"
          value={formatParticipants(participantCount)}
        />
      </div>

      {showBreakdown ? (
        <div className="mt-2 border-t border-fade-detail pt-2">
          <RallyPoolBreakdown
            layout="strip"
            joinPoolYocto={joinPoolYocto}
            sponsoredPoolYocto={sponsoredPoolYocto}
            joinRouting={joinRouting}
            protocolFeesRouteToBoost={protocolFeesRouteToBoost}
          />
        </div>
      ) : null}
    </div>
  );
}
