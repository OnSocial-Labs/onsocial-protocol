'use client';

import { PageShell } from '@/components/layout/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

function FilterRailSkeleton({ stickyTop }: { stickyTop: number | string }) {
  return (
    <div
      className="sticky z-20 mb-3 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ top: stickyTop }}
      aria-hidden
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-[8.75rem] shrink-0 rounded-full bg-foreground/[0.08]" />
        <Skeleton className="h-8 min-w-0 flex-1 rounded-full bg-foreground/[0.06]" />
      </div>
    </div>
  );
}

export function ProfileNetworkRouteLoading() {
  const stickyTop = useNavStickyTop();

  return (
    <PageShell size="form" className="flex min-h-0 flex-1 flex-col px-0">
      <div
        className={cn(
          'flex min-h-0 w-full min-w-0 flex-1 flex-col',
          profilePageMobileGutterClass
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-4 pb-6 md:pb-8',
            profilePageDiscoverColumnClass
          )}
        >
          <FilterRailSkeleton stickyTop={stickyTop} />
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 md:px-5">
            <Skeleton className="aspect-square w-full max-w-[min(460px,100%)] rounded-full bg-foreground/[0.04]" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
