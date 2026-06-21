import { PageShell } from '@/components/layout/page-shell';
import { PanelSkeleton, Skeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { BoostLeaderboardPageIntro } from '@/features/boost/boost-leaderboard-page-intro';

function StatsStripSkeleton() {
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <SurfacePanel key={index} radius="md" tone="inset" padding="snug">
          <Skeleton className="h-3 w-20 rounded-full bg-foreground/[0.06]" />
          <Skeleton className="mt-2 h-8 w-24 rounded-full bg-foreground/[0.08]" />
          <Skeleton className="mt-1 h-4 w-28 rounded-full bg-foreground/[0.05]" />
        </SurfacePanel>
      ))}
    </div>
  );
}

export function BoostLeaderboardPageLoadingShell() {
  return (
    <PageShell className="max-w-6xl">
      <BoostLeaderboardPageIntro />

      <StatsStripSkeleton />

      <SurfacePanel radius="xl" tone="soft" className="mb-6 p-5 md:p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-8 w-24 rounded-full bg-foreground/[0.06]"
            />
          ))}
        </div>
        <PanelSkeleton minHeight="20rem" detailLines={4} />
      </SurfacePanel>
    </PageShell>
  );
}
