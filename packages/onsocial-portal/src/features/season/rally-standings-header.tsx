'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { governanceBoardButtonClass } from '@/features/governance/governance-segment-button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  SEASON_STANDINGS_META_ROW_CLASS,
  SEASON_STANDINGS_META_SKELETON_CLASS,
  SEASON_STANDINGS_RULES_SLOT_CLASS,
} from '@/features/season/season-page-column';
import { cn } from '@/lib/utils';

const railIconButtonClass =
  'h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground';

const railIconSlotClass = 'flex h-8 w-8 shrink-0 items-center justify-center';

export function formatRallyStandingsMeta({
  loadedCount,
  total,
}: {
  loadedCount: number;
  total: number;
}): string | null {
  if (total <= 0) {
    return null;
  }

  return `${loadedCount.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
}

function RallyStandingsActionsSkeleton({
  reserveRulesSlot = true,
}: {
  reserveRulesSlot?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {reserveRulesSlot ? (
        <div
          className={cn(
            SEASON_STANDINGS_RULES_SLOT_CLASS,
            'rounded-full bg-foreground/[0.06]'
          )}
          aria-hidden
        />
      ) : (
        <div className={SEASON_STANDINGS_RULES_SLOT_CLASS} aria-hidden />
      )}
      <div
        className={cn(railIconSlotClass, 'rounded-full bg-foreground/[0.06]')}
        aria-hidden
      />
    </div>
  );
}

export function RallyStandingsHeaderSkeleton({
  reserveRulesSlot = true,
}: {
  reserveRulesSlot?: boolean;
} = {}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <BoostPanelSectionTitle>Standings</BoostPanelSectionTitle>
        <div className={SEASON_STANDINGS_META_ROW_CLASS}>
          <div
            className={cn(
              SEASON_STANDINGS_META_SKELETON_CLASS,
              'rounded-full bg-foreground/[0.06]'
            )}
            aria-hidden
          />
        </div>
      </div>
      <RallyStandingsActionsSkeleton reserveRulesSlot={reserveRulesSlot} />
    </div>
  );
}

export function RallyStandingsHeader({
  meta,
  showRules = false,
  onOpenRules,
  loading = false,
  onRefresh,
  className,
}: {
  meta: string | null;
  showRules?: boolean;
  onOpenRules?: () => void;
  loading?: boolean;
  onRefresh: () => void;
  className?: string;
}) {
  const showMetaSkeleton = loading || !meta;
  const reserveRulesSlot = loading || showRules;

  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <BoostPanelSectionTitle>Standings</BoostPanelSectionTitle>
        <div className={SEASON_STANDINGS_META_ROW_CLASS}>
          {showMetaSkeleton ? (
            <div
              className={cn(
                SEASON_STANDINGS_META_SKELETON_CLASS,
                'rounded-full bg-foreground/[0.06]'
              )}
              aria-hidden
            />
          ) : (
            <p className="truncate text-[11px] tabular-nums text-muted-foreground/65">
              {meta}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {reserveRulesSlot ? (
          loading ? (
            <div
              className={cn(
                SEASON_STANDINGS_RULES_SLOT_CLASS,
                'rounded-full bg-foreground/[0.06]'
              )}
              aria-hidden
            />
          ) : showRules && onOpenRules ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className={governanceBoardButtonClass(false)}
              onClick={onOpenRules}
            >
              Rules
            </Button>
          ) : (
            <div className={SEASON_STANDINGS_RULES_SLOT_CLASS} aria-hidden />
          )
        ) : null}

        <div className={railIconSlotClass}>
          <PortalHoverTooltip
            tooltip={loading ? 'Refreshing standings' : 'Refresh standings'}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh standings"
              className={railIconButtonClass}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </PortalHoverTooltip>
        </div>
      </div>
    </div>
  );
}
