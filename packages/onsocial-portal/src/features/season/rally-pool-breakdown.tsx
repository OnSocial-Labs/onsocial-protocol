'use client';

import Link from 'next/link';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { RALLY_LINE_BOX_STRIP } from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
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

const STRIP_LINE_CLASS = RALLY_LINE_BOX_STRIP;

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
  href = null,
}: {
  amount: string;
  label: string;
  className?: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span className="font-mono tabular-nums">{amount}</span>
      <span className="ml-1">{label}</span>
      {href ? <ProtocolMotionArrow className="h-3 w-3" /> : null}
    </>
  );

  if (!href) {
    return (
      <span className={cn('whitespace-nowrap', className)}>{content}</span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'portal-action-link group pointer-events-auto relative z-[2] inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-foreground',
        className
      )}
    >
      {content}
    </Link>
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
  joinEntryLabel = null,
  joinEntryLoading = false,
  treasurySeedHref = null,
  className,
  layout = 'stacked',
  emptyLabel = 'Reward pool',
}: {
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  joinRouting?: RallyPoolJoinRouting | null;
  protocolFeesRouteToBoost?: boolean;
  /** Per-player join cost — grouped with treasury seed and join flow. */
  joinEntryLabel?: string | null;
  joinEntryLoading?: boolean;
  /** Governance proposal or explorer link for treasury seed provenance. */
  treasurySeedHref?: string | null;
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
  const hasEntry = Boolean(joinEntryLabel?.trim());
  const showEntryRow = hasEntry || joinEntryLoading;

  if (!hasJoinFlow && !hasTreasurySeed && !showEntryRow) {
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
        {showEntryRow || hasTreasurySeed ? (
          <p
            className={cn(
              STRIP_LINE_CLASS,
              'whitespace-nowrap',
              hasTreasurySeed ? 'portal-gold-text' : 'text-muted-foreground/70'
            )}
          >
            {joinEntryLoading ? (
              <RallyTextSlot
                lineClass="inline-flex min-h-3 items-center leading-none"
                loading
                pulseClass="h-[1em] w-14"
              />
            ) : hasEntry ? (
              <StripSegment
                amount={joinEntryLabel!}
                label="Entry"
                className={
                  hasTreasurySeed ? 'text-muted-foreground/75' : undefined
                }
              />
            ) : null}
            {(joinEntryLoading || hasEntry) && hasTreasurySeed ? (
              <StripDot />
            ) : null}
            {hasTreasurySeed ? (
              <StripSegment
                amount={treasuryLabel!}
                label="Treasury seed"
                href={treasurySeedHref}
              />
            ) : null}
          </p>
        ) : null}
        {hasJoinFlow ? (
          <p
            className={cn(
              STRIP_LINE_CLASS,
              'whitespace-nowrap text-muted-foreground/70'
            )}
          >
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
      {hasEntry ? (
        <p className="portal-type-micro leading-snug text-muted-foreground/65">
          <span className="whitespace-nowrap">
            <span className="font-mono font-semibold tabular-nums text-foreground/85">
              {joinEntryLabel}
            </span>
            <span className="ml-1 font-medium">entry</span>
          </span>
        </p>
      ) : null}
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
          <StripSegment
            amount={formatPoolAmount(sponsoredPoolYocto)}
            label="Treasury seed"
            href={treasurySeedHref}
            className="portal-gold-text"
          />
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
  joinEntryLabel?: string | null;
  joinEntryLoading?: boolean;
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
    BigInt(input.sponsoredPoolYocto ?? '0') > 0n ||
    Boolean(input.joinEntryLabel?.trim()) ||
    Boolean(input.joinEntryLoading)
  );
}
