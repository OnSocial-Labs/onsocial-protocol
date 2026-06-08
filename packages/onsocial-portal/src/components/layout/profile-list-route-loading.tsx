'use client';

import { PageShell } from '@/components/layout/page-shell';
import {
  ProfileListSkeletonRows,
  type ProfileListSkeletonVariant,
} from '@/features/profile/profile-list-loading';
import { ProfileListFilterRailSkeleton } from '@/features/profile/profile-list-filter-rail';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
  stickyRailShadowClass,
} from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

export function ProfileListRouteLoading({
  listVariant = 'profile',
  showTrailingRailAction = false,
}: {
  listVariant?: ProfileListSkeletonVariant;
  showTrailingRailAction?: boolean;
}) {
  const stickyTop = useNavStickyTop();

  return (
    <PageShell size="form" className="px-0">
      <div className={cn('w-full min-w-0', profilePageMobileGutterClass)}>
        <div
          className={cn(
            'flex flex-col gap-4 pb-12',
            profilePageDiscoverColumnClass
          )}
        >
          {listVariant === 'discovery' ? (
            <div
              className="sticky z-20 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ top: stickyTop }}
              aria-hidden
            >
              <Skeleton
                className={cn(
                  'h-11 w-full rounded-full bg-foreground/[0.06]',
                  stickyRailShadowClass
                )}
              />
            </div>
          ) : (
            <ProfileListFilterRailSkeleton
              stickyTop={stickyTop}
              showTrailing={showTrailingRailAction}
            />
          )}
          <ProfileListSkeletonRows variant={listVariant} count={6} />
        </div>
      </div>
    </PageShell>
  );
}
