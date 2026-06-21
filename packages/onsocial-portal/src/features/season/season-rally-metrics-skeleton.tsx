'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  SEASON_PULSE_VALUE_ROW_CLASS,
  SEASON_RALLY_FOOTER_MIN_CLASS,
} from '@/features/season/season-page-column';
import { cn } from '@/lib/utils';

function MetricSkeleton() {
  return (
    <div className="flex min-w-[4.5rem] flex-1 flex-col items-center text-center sm:min-w-0">
      <Skeleton className="h-3 w-10 rounded-full bg-foreground/[0.06]" />
      <div className={SEASON_PULSE_VALUE_ROW_CLASS}>
        <Skeleton className="h-5 w-14 rounded-full bg-foreground/[0.06]" />
      </div>
    </div>
  );
}

function BreakdownStripSkeleton() {
  return (
    <div className="mt-2 space-y-1 border-t border-fade-detail pt-2">
      <Skeleton className="mx-auto h-3 w-36 max-w-full rounded-full bg-foreground/[0.06]" />
      <Skeleton className="mx-auto h-3 w-28 max-w-full rounded-full bg-foreground/[0.05]" />
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
      <div className="border-b border-fade-detail px-3 py-2.5 sm:px-3.5">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between sm:gap-2">
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
        </div>
        {showBreakdownStrip ? <BreakdownStripSkeleton /> : null}
      </div>
      {showFooter ? (
        <div
          className={cn(
            'px-3 py-2.5 md:px-4',
            SEASON_RALLY_FOOTER_MIN_CLASS,
            'flex flex-col justify-center gap-2.5 sm:flex-row sm:items-center sm:justify-between'
          )}
        >
          <Skeleton className="h-4 w-40 max-w-full rounded-full bg-foreground/[0.06]" />
          <Skeleton className="h-9 w-[7.25rem] shrink-0 rounded-full bg-foreground/[0.06]" />
        </div>
      ) : null}
    </div>
  );
}
