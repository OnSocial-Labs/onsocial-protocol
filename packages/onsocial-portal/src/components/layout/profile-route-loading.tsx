import { PageShell } from '@/components/layout/page-shell';
import { ProfileListSkeletonRows } from '@/features/profile/profile-list-loading';
import { Skeleton } from '@/components/ui/skeleton';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

export function ProfileRouteLoading({
  listVariant = 'profile',
}: {
  listVariant?: 'profile' | 'discovery' | 'endorsement';
}) {
  return (
    <PageShell size="form" className="px-0">
      <div className={cn('w-full min-w-0', profilePageMobileGutterClass)}>
        <div
          className={cn(
            'flex flex-col gap-4 pb-12',
            profilePageDiscoverColumnClass
          )}
        >
          <Skeleton className="h-28 w-full rounded-2xl bg-foreground/[0.06] md:h-32" />
          <div className="flex items-start gap-3 px-2">
            <Skeleton className="h-[var(--profile-avatar-size)] w-[var(--profile-avatar-size)] shrink-0 rounded-full bg-foreground/[0.08]" />
            <div className="min-w-0 flex-1 space-y-2 pt-2">
              <Skeleton className="h-5 w-40 max-w-full bg-foreground/[0.08]" />
              <Skeleton className="h-3 w-28 max-w-full bg-foreground/5" />
            </div>
          </div>
          <ProfileListSkeletonRows variant={listVariant} count={6} />
        </div>
      </div>
    </PageShell>
  );
}
