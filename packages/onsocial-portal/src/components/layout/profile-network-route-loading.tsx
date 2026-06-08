'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ProfileListFilterRailSkeleton } from '@/features/profile/profile-list-filter-rail';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

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
          <ProfileListFilterRailSkeleton stickyTop={stickyTop} />
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 md:px-5">
            <Skeleton className="aspect-square w-full max-w-[min(460px,100%)] rounded-full bg-foreground/[0.04]" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
