'use client';

import {
  RALLY_LINE_BOX_STRIP,
  SEASON_RALLY_METRICS_PAD_CLASS,
  SEASON_RALLY_PULSE_DIVIDER_CLASS,
} from '@/features/season/season-page-column';
import { RallyJoinFooterSkeleton } from '@/features/season/rally-join-footer-skeleton';
import { RallyPulseItem } from '@/features/season/season-rally-pulse';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { cn } from '@/lib/utils';

function BreakdownStripSkeleton() {
  return (
    <div className="mt-2 space-y-1">
      <RallyTextSlot
        lineClass={RALLY_LINE_BOX_STRIP}
        loading
        pulseClass="h-[1em] w-36 max-w-full"
      />
      <RallyTextSlot
        lineClass={RALLY_LINE_BOX_STRIP}
        loading
        pulseClass="h-[1em] w-28 max-w-full opacity-80"
      />
    </div>
  );
}

export function SeasonRallyMetricsSkeleton({
  showFooter = true,
  showBreakdownStrip = true,
  className,
}: {
  showFooter?: boolean;
  showBreakdownStrip?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          'border-b border-fade-detail',
          SEASON_RALLY_METRICS_PAD_CLASS
        )}
      >
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between sm:gap-2">
          <RallyPulseItem label="" value="" loading />
          <span aria-hidden className={SEASON_RALLY_PULSE_DIVIDER_CLASS} />
          <RallyPulseItem label="" value="" loading />
          <span aria-hidden className={SEASON_RALLY_PULSE_DIVIDER_CLASS} />
          <RallyPulseItem label="" value="" loading />
        </div>
        {showBreakdownStrip ? <BreakdownStripSkeleton /> : null}
      </div>
      {showFooter ? (
        <div className="border-t border-fade-detail">
          <RallyJoinFooterSkeleton />
        </div>
      ) : null}
    </div>
  );
}
