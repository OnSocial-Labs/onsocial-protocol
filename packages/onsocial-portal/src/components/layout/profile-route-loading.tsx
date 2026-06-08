import { PageShell } from '@/components/layout/page-shell';
import { ProfileIdentityLoading } from '@/features/profile/profile-identity-loading';
import type { ProfileListSkeletonVariant } from '@/features/profile/profile-list-loading';
import { ProfileListRouteLoading } from '@/components/layout/profile-list-route-loading';
import { profilePageMobileGutterClass } from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

export type ProfileRouteLoadingLayout = 'profile' | 'list';

export function ProfileRouteLoading({
  layout = 'profile',
  listVariant = 'profile',
  showTrailingRailAction = false,
}: {
  /** `profile` = hero shell only; `list` = filter rail + rows (stand, endorsements, discover). */
  layout?: ProfileRouteLoadingLayout;
  listVariant?: ProfileListSkeletonVariant;
  showTrailingRailAction?: boolean;
}) {
  if (layout === 'list') {
    return (
      <ProfileListRouteLoading
        listVariant={listVariant}
        showTrailingRailAction={showTrailingRailAction}
      />
    );
  }

  return (
    <PageShell size="form" className="px-0">
      <div className={cn('w-full min-w-0', profilePageMobileGutterClass)}>
        <ProfileIdentityLoading fullPage />
      </div>
    </PageShell>
  );
}
