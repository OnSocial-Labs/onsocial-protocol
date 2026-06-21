import { PageShell } from '@/components/layout/page-shell';
import { GovernancePageIntro } from '@/features/governance/governance-page-intro';
import { Skeleton } from '@/components/ui/skeleton';
import { GovernanceCardSkeleton } from '@/features/governance/governance-card-sections';

function GovernanceRailLoadingPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="mb-6 rounded-2xl border border-border/50 bg-background/88 px-3 py-3 md:rounded-[1.5rem] md:px-4 md:py-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 border-b border-fade-detail pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-full bg-foreground/[0.07]" />
            <Skeleton className="h-8 w-20 rounded-full bg-foreground/[0.06]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="h-8 w-10 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-16 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-16 rounded-full bg-foreground/[0.06]" />
          </div>
          <Skeleton className="h-8 w-28 shrink-0 rounded-full bg-foreground/[0.08]" />
        </div>

        <div className="flex items-center gap-2 border-t border-fade-detail pt-3 md:gap-4">
          <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
            <Skeleton className="h-8 w-12 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-16 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-14 rounded-full bg-foreground/[0.06]" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0 rounded-full bg-foreground/[0.06] md:hidden" />
          <Skeleton className="h-10 min-w-0 flex-1 rounded-xl bg-foreground/[0.05]" />
        </div>
      </div>
    </div>
  );
}

export function GovernanceCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <GovernanceCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function GovernancePageLoadingShell({
  cardCount = 3,
}: {
  cardCount?: number;
}) {
  return (
    <PageShell className="max-w-6xl">
      <GovernancePageIntro />

      <GovernanceRailLoadingPlaceholder />
      <GovernanceCardSkeletonList count={cardCount} />
    </PageShell>
  );
}
