import { PageShell, type PageShellSize } from '@/components/layout/page-shell';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  PanelSkeleton,
  Skeleton,
  SkeletonText,
} from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type RouteLoadingShellProps = {
  size?: PageShellSize;
  className?: string;
  contentClassName?: string;
  panelCount?: number;
  panelMinHeights?: string[];
};

export function RouteLoadingShell({
  size = 'standard',
  className,
  contentClassName,
  panelCount = 2,
  panelMinHeights,
}: RouteLoadingShellProps) {
  return (
    <PageShell size={size} className={className}>
      <div className="relative mb-8 px-2 py-3 md:py-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-60 blur-3xl [background:radial-gradient(circle_at_28%_20%,rgb(96_165_250_/_0.16),transparent_36%),radial-gradient(circle_at_72%_26%,rgb(74_222_128_/_0.12),transparent_32%)]" />
        <div className="relative z-10 mx-auto max-w-4xl">
          <Skeleton className="mb-4 h-7 w-28 rounded-full border border-border/40 bg-background/45" />
          <Skeleton className="h-11 max-w-2xl rounded-full" />
          <SkeletonText
            lines={2}
            className="mt-3"
            widths={['max-w-xl', 'max-w-lg']}
          />
        </div>
      </div>

      <div className={cn('space-y-4', contentClassName)}>
        {Array.from({ length: panelCount }).map((_, index) => (
          <SurfacePanel
            key={index}
            radius="xl"
            tone="soft"
            padding="roomy"
            className="overflow-hidden"
          >
            <PanelSkeleton
              minHeight={
                panelMinHeights?.[index] ?? (index === 0 ? '12rem' : '10rem')
              }
            />
          </SurfacePanel>
        ))}
      </div>
    </PageShell>
  );
}
