'use client';

import type { ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { SeasonCountdownLabel } from '@/features/season/season-countdown-label';
import {
  RallyPoolBreakdown,
  rallyPoolBreakdownVisible,
} from '@/features/season/rally-pool-breakdown';
import {
  RALLY_LINE_BOX_MICRO,
  RALLY_LINE_BOX_SCORE,
  RALLY_LINE_BOX_STRIP,
  SEASON_RALLY_METRICS_PAD_CLASS,
  SEASON_RALLY_PULSE_DIVIDER_CLASS,
} from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  type SeasonTreasurySeedSource,
  type SeasonZeroLifecyclePhase,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { useSeasonZeroLifecyclePhase } from '@/features/season/use-season-zero-lifecycle-phase';
import { readTimestampNs } from '@/lib/relative-duration';
import { resolveTreasurySeedHref } from '@/lib/season-treasury-seed';
import { cn } from '@/lib/utils';

const PHASE_COPY: Record<
  SeasonZeroLifecyclePhase,
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

const PULSE_ACCENT_VALUE: Record<
  (typeof PHASE_COPY)[SeasonZeroLifecyclePhase]['accent'],
  string
> = {
  gold: 'portal-gold-text',
  blue: 'portal-blue-text',
  green: 'portal-green-text',
  neutral: 'text-foreground',
};

export function RallyPulseItem({
  label,
  value,
  valueClassName,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-[4.5rem] flex-1 flex-col items-center text-center sm:min-w-0">
      <RallyTextSlot
        lineClass={cn(RALLY_LINE_BOX_MICRO, 'text-muted-foreground/70')}
        loading={loading}
        pulseClass="h-[1em] w-10"
      >
        {label}
      </RallyTextSlot>
      <RallyTextSlot
        lineClass={cn(
          RALLY_LINE_BOX_SCORE,
          'mt-0.5 justify-center',
          valueClassName ?? 'text-foreground'
        )}
        loading={loading}
        pulseClass="h-[1em] w-14"
      >
        {value}
      </RallyTextSlot>
    </div>
  );
}

function PulseDivider() {
  return <span aria-hidden className={SEASON_RALLY_PULSE_DIVIDER_CLASS} />;
}

function formatParticipants(total: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    total
  );
}

/** Live countdown with homepage-style clock affordance in the pulse rail. */
function RallyPulseLiveCountdown({ targetNs }: { targetNs: number }) {
  return (
    <span className="inline-flex items-center justify-center gap-1">
      <span className="relative inline-flex shrink-0">
        <span
          className="absolute inset-0 rounded-full bg-[var(--portal-gold)]/20 motion-safe:animate-ping"
          aria-hidden
        />
        <Clock className="relative h-3 w-3 portal-gold-icon" aria-hidden />
      </span>
      <SeasonCountdownLabel targetNs={targetNs} compact />
    </span>
  );
}

function resolvePulsePrimaryColumn(
  phase: SeasonZeroLifecyclePhase,
  startsAtNs: number,
  endsAtNs: number
): {
  label: string;
  value: ReactNode;
  valueClassName?: string;
} {
  const copy = PHASE_COPY[phase];

  if (phase === 'upcoming') {
    return {
      label: 'Opens in',
      value:
        startsAtNs > 0 ? (
          <SeasonCountdownLabel targetNs={startsAtNs} compact />
        ) : (
          (copy.shortTitle ?? copy.title)
        ),
      valueClassName: PULSE_ACCENT_VALUE[copy.accent],
    };
  }

  if (phase === 'live') {
    return {
      label: 'Ends in',
      value:
        endsAtNs > 0 ? (
          <RallyPulseLiveCountdown targetNs={endsAtNs} />
        ) : (
          copy.title
        ),
      valueClassName: PULSE_ACCENT_VALUE[copy.accent],
    };
  }

  return {
    label: 'Status',
    value: copy.shortTitle ?? copy.title,
    valueClassName: PULSE_ACCENT_VALUE[copy.accent],
  };
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
  joinEntryLabel = null,
  joinEntryLoading = false,
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
  joinEntryLabel?: string | null;
  joinEntryLoading?: boolean;
  treasurySeedSource?: SeasonTreasurySeedSource | null;
  className?: string;
}) {
  const phase = useSeasonZeroLifecyclePhase(onChainConfig, settlement) ?? 'upcoming';
  const endsAtNs = readTimestampNs(onChainConfig.ends_at_ns);
  const startsAtNs = readTimestampNs(onChainConfig.starts_at_ns);
  const primaryColumn = resolvePulsePrimaryColumn(phase, startsAtNs, endsAtNs);
  const poolLabel = formatGenesisSocialBalanceDisplay(indexedPoolYocto ?? '0');
  const showBreakdown = rallyPoolBreakdownVisible({
    joinPoolYocto,
    sponsoredPoolYocto,
    joinRouting,
    protocolFeesRouteToBoost,
    joinEntryLabel,
    joinEntryLoading,
  });
  const treasurySeedHref = resolveTreasurySeedHref(treasurySeedSource);

  return (
    <div
      className={cn(
        'border-b border-fade-detail',
        SEASON_RALLY_METRICS_PAD_CLASS,
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between sm:gap-2">
        <RallyPulseItem
          label={primaryColumn.label}
          value={primaryColumn.value}
          valueClassName={primaryColumn.valueClassName}
        />
        <PulseDivider />
        <RallyPulseItem
          label="Pool"
          value={poolLabel}
          valueClassName="text-foreground"
        />
        <PulseDivider />
        <RallyPulseItem
          label="In the rally"
          value={formatParticipants(participantCount)}
        />
      </div>

      {showBreakdown ? (
        <div className="mt-2">
          <RallyPoolBreakdown
            layout="strip"
            joinPoolYocto={joinPoolYocto}
            sponsoredPoolYocto={sponsoredPoolYocto}
            joinRouting={joinRouting}
            protocolFeesRouteToBoost={protocolFeesRouteToBoost}
            joinEntryLabel={joinEntryLabel}
            joinEntryLoading={joinEntryLoading}
            treasurySeedHref={treasurySeedHref}
          />
        </div>
      ) : null}
    </div>
  );
}
