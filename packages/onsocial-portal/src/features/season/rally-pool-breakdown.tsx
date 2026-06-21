'use client';

import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  estimateJoinBurnYocto,
  estimateJoinTreasuryYocto,
} from '@/lib/join-rally-routing';
import { cn } from '@/lib/utils';

export type RallyPoolJoinRouting = {
  season_pool_bps: number;
  burn_bps: number;
  treasury_bps: number;
};

function formatPoolAmount(yocto: string | bigint | undefined): string {
  const label = formatGenesisSocialBalanceDisplay(yocto ?? '0');
  return label === '0' ? '0' : label;
}

const STRIP_LINE_CLASS =
  'text-center text-[10px] font-medium uppercase tracking-[0.12em] sm:text-[11px]';

function resolveJoinFlowParts(
  joinPoolYocto: string | undefined,
  joinRouting?: RallyPoolJoinRouting | null,
  protocolFeesRouteToBoost = false
) {
  const joinLabel = formatPoolAmount(joinPoolYocto);
  const burnYocto =
    joinRouting && joinRouting.burn_bps > 0
      ? estimateJoinBurnYocto(
          joinPoolYocto ?? '0',
          joinRouting.season_pool_bps,
          joinRouting.burn_bps
        )
      : 0n;
  const treasuryYocto =
    joinRouting && joinRouting.treasury_bps > 0
      ? estimateJoinTreasuryYocto(
          joinPoolYocto ?? '0',
          joinRouting.season_pool_bps,
          joinRouting.treasury_bps
        )
      : 0n;
  const burnLabel = burnYocto > 0n ? formatPoolAmount(burnYocto) : null;
  const boostLabel =
    protocolFeesRouteToBoost && treasuryYocto > 0n
      ? formatPoolAmount(treasuryYocto)
      : null;

  return {
    joinLabel,
    burnLabel,
    boostLabel,
    hasJoins: joinLabel !== '0',
    hasBurn: burnLabel != null,
    hasBoost: boostLabel != null,
  };
}

function StripSegment({
  amount,
  label,
  className,
}: {
  amount: string;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn('whitespace-nowrap', className)}>
      <span className="font-mono tabular-nums">{amount}</span>
      <span className="ml-1">{label}</span>
    </span>
  );
}

function StripDot() {
  return <span className="text-muted-foreground/35"> · </span>;
}

export function RallyPoolBreakdown({
  joinPoolYocto,
  sponsoredPoolYocto,
  joinRouting,
  protocolFeesRouteToBoost = false,
  className,
  layout = 'stacked',
  emptyLabel = 'Reward pool',
}: {
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  joinRouting?: RallyPoolJoinRouting | null;
  protocolFeesRouteToBoost?: boolean;
  className?: string;
  /** `strip` — full-width uppercase footer under the metrics row. */
  layout?: 'stacked' | 'strip';
  emptyLabel?: string;
}) {
  const { joinLabel, burnLabel, boostLabel, hasJoins, hasBurn, hasBoost } =
    resolveJoinFlowParts(joinPoolYocto, joinRouting, protocolFeesRouteToBoost);
  const sponsored = BigInt(sponsoredPoolYocto ?? '0');
  const hasJoinFlow = hasJoins || hasBurn || hasBoost;
  const hasTreasurySeed = sponsored > 0n;

  if (!hasJoinFlow && !hasTreasurySeed) {
    if (layout === 'strip') {
      return null;
    }

    return (
      <p
        className={cn(
          'portal-type-micro leading-snug text-muted-foreground/65',
          className
        )}
      >
        {emptyLabel}
      </p>
    );
  }

  if (layout === 'strip') {
    const treasuryLabel = hasTreasurySeed
      ? formatPoolAmount(sponsoredPoolYocto)
      : null;

    return (
      <div className={cn('space-y-1', className)}>
        {treasuryLabel ? (
          <p className={cn(STRIP_LINE_CLASS, 'portal-gold-text')}>
            <span className="font-mono tabular-nums">{treasuryLabel}</span>
            <span className="ml-1">Treasury seed</span>
          </p>
        ) : null}
        {hasJoinFlow ? (
          <p className={cn(STRIP_LINE_CLASS, 'text-muted-foreground/70')}>
            {hasJoins ? (
              <StripSegment amount={joinLabel} label="Joins" />
            ) : null}
            {hasJoins && hasBoost ? <StripDot /> : null}
            {hasBoost && boostLabel ? (
              <StripSegment
                amount={boostLabel}
                label="Boost"
                className="portal-blue-text"
              />
            ) : null}
            {(hasJoins || hasBoost) && hasBurn ? <StripDot /> : null}
            {hasBurn && burnLabel ? (
              <StripSegment amount={burnLabel} label="Burn" />
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-0.5', className)}>
      {hasJoinFlow ? (
        <p className="portal-type-micro leading-snug text-muted-foreground/65">
          {hasJoins ? (
            <span className="whitespace-nowrap">{joinLabel} joins</span>
          ) : null}
          {hasJoins && hasBoost ? (
            <span className="text-muted-foreground/35"> · </span>
          ) : null}
          {hasBoost && boostLabel ? (
            <span className="whitespace-nowrap portal-blue-text">
              {boostLabel} boost
            </span>
          ) : null}
          {(hasJoins || hasBoost) && hasBurn ? (
            <span className="text-muted-foreground/35"> · </span>
          ) : null}
          {hasBurn && burnLabel ? (
            <span className="whitespace-nowrap">{burnLabel} burn</span>
          ) : null}
        </p>
      ) : null}
      {hasTreasurySeed ? (
        <p className="portal-type-micro leading-snug">
          <span className="whitespace-nowrap portal-gold-text">
            <span className="font-mono font-semibold tabular-nums">
              {formatPoolAmount(sponsoredPoolYocto)}
            </span>
            <span className="ml-1 font-medium">Treasury seed</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function rallyPoolBreakdownVisible(input: {
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  joinRouting?: RallyPoolJoinRouting | null;
  protocolFeesRouteToBoost?: boolean;
}): boolean {
  const { hasJoins, hasBurn, hasBoost } = resolveJoinFlowParts(
    input.joinPoolYocto,
    input.joinRouting,
    input.protocolFeesRouteToBoost
  );

  return (
    hasJoins ||
    hasBurn ||
    hasBoost ||
    BigInt(input.sponsoredPoolYocto ?? '0') > 0n
  );
}
