'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { governanceBoardButtonClass } from '@/features/governance/governance-segment-button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { cn } from '@/lib/utils';

const railIconButtonClass =
  'h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground';

const railIconSlotClass = 'flex h-8 w-8 shrink-0 items-center justify-center';

export function formatRallyStandingsMeta({
  showPublishedRewards,
  loadedCount,
  total,
}: {
  showPublishedRewards: boolean;
  loadedCount: number;
  total: number;
}): string | null {
  if (total <= 0) {
    return showPublishedRewards ? 'Final SOCIAL rewards' : null;
  }

  const countLabel = `${loadedCount.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;

  if (showPublishedRewards) {
    return `Final SOCIAL rewards · ${countLabel}`;
  }

  return countLabel;
}

export function RallyStandingsHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <BoostPanelSectionTitle>Standings</BoostPanelSectionTitle>
        <div className="h-3 w-40 rounded bg-muted/40" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-7 w-14 rounded-full border border-border/40 bg-transparent" />
        <div className="h-8 w-8 rounded-full border border-border/40 bg-transparent" />
      </div>
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
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <BoostPanelSectionTitle>Standings</BoostPanelSectionTitle>
        {meta ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/65">
            {meta}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showRules && onOpenRules ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={governanceBoardButtonClass(false)}
            onClick={onOpenRules}
          >
            Rules
          </Button>
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
