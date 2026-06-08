import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { GovernanceCardSkeleton } from '@/features/governance/governance-card-sections';

function GovernanceRailLoadingPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="mb-6 rounded-2xl border border-border/50 bg-background/88 px-3 py-3 md:rounded-[1.5rem] md:px-4 md:py-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="h-8 w-12 rounded-full bg-foreground/[0.07]" />
            <Skeleton className="h-8 w-16 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-16 rounded-full bg-foreground/[0.06]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-xl bg-foreground/[0.05]" />
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
      <SecondaryPageHeader
        badge="Governance"
        badgeAccent="blue"
        glowAccents={['blue', 'green']}
        glowClassName="h-56 opacity-80"
        title="Communities that govern in public"
        description="Review proposals, track guardians, and follow launches as decisions move on-chain."
      />

      <SectionHeader
        badge="Proposals"
        className="flex-row items-center justify-between gap-3 md:items-end"
        contentClassName="flex-1"
      />

      <GovernanceRailLoadingPlaceholder />
      <GovernanceCardSkeletonList count={cardCount} />
    </PageShell>
  );
}
