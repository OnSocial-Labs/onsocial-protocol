'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { SEASON_PANEL_PADDING_CLASS } from '@/features/season/season-page-column';
import { cn } from '@/lib/utils';

export function SeasonZeroGuidePanelSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="none"
      className={cn('border-border/40', SEASON_PANEL_PADDING_CLASS, className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3 w-24 rounded-full bg-foreground/[0.06]" />
          <Skeleton className="h-3.5 w-32 rounded-full bg-foreground/[0.05]" />
        </div>
        <Skeleton className="h-4 w-4 shrink-0 rounded-full bg-foreground/[0.06]" />
      </div>
    </SurfacePanel>
  );
}
