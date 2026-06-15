import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import {
  profilePageBannerSurfaceClass,
  profilePageHorizontalPaddingClass,
} from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

export const profileIdentityLayoutClass =
  '[--profile-avatar-size:5rem] md:[--profile-avatar-size:6rem]';

export const profileIdentityOverlapClass =
  '-mt-[calc(var(--profile-avatar-size)/2)]';

export const profileIdentityAvatarSizeClass =
  'h-[var(--profile-avatar-size)] w-[var(--profile-avatar-size)]';

export const profileIdentityAvatarDockClass =
  'flex w-[var(--profile-avatar-size)] shrink-0 flex-col items-center gap-1.5';

/** Action pills opposite the avatar, right-aligned under the banner overlap. */
export const profileIdentityActionsClass =
  'flex min-w-0 flex-1 items-start justify-end pb-1 pt-[calc(var(--profile-avatar-size)/2+0.375rem)]';

/** Name and handle — full width below the avatar row. */
export const profileIdentityTextClass = 'min-w-0 space-y-0.5';

/** Standing network preview, then joined date — under bio. */
export const profileIdentityMetaRowClass =
  'flex min-w-0 w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 portal-type-body-sm';

export function ProfileStandingNetworkSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('flex -space-x-1', className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-5 rounded-full" />
      ))}
    </div>
  );
}

/** Skeleton for profile hero — matches loaded banner, avatar, and social strip layout. */
export function ProfileIdentityLoading({
  fullPage = false,
  showBioSkeleton = true,
  showSocialSkeleton = true,
}: {
  fullPage?: boolean;
  showBioSkeleton?: boolean;
  showSocialSkeleton?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          'aspect-[5/1] w-full bg-foreground/[0.03]',
          fullPage && profilePageBannerSurfaceClass
        )}
      />
      <div
        className={cn(
          'relative z-10 space-y-3 pb-5 md:px-5',
          profileIdentityLayoutClass,
          profileIdentityOverlapClass,
          fullPage
            ? cn('pb-12', profilePageHorizontalPaddingClass)
            : 'px-4 pb-5 md:px-5'
        )}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-3.5">
            <div className={profileIdentityAvatarDockClass}>
              <Skeleton
                className={cn(
                  'rounded-2xl !border-[3px] !border-background',
                  profileIdentityAvatarSizeClass
                )}
              />
            </div>
            <div className={profileIdentityActionsClass}>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Skeleton className="h-6 w-[4.5rem] rounded-full bg-foreground/[0.07]" />
              </div>
            </div>
          </div>
          <div className={cn(profileIdentityTextClass, 'space-y-1.5')}>
            <Skeleton className="h-[1.3125rem] w-36 max-w-full bg-foreground/10" />
            <Skeleton className="h-3.5 w-40 max-w-full bg-foreground/[0.06]" />
          </div>
        </div>
        {showBioSkeleton ? (
          <SkeletonText
            lines={2}
            className="max-w-md"
            widths={['w-full', 'w-3/5']}
          />
        ) : null}
        {showSocialSkeleton ? (
          <div className={profileIdentityMetaRowClass}>
            <ProfileStandingNetworkSkeleton />
            <Skeleton className="h-3.5 w-28 rounded bg-foreground/[0.06]" />
          </div>
        ) : null}
        {showSocialSkeleton ? <ProfileSignalsBandSkeleton /> : null}
      </div>
    </>
  );
}

/** Unified protocol signals band — standing, endorsements, reputation. */
export function ProfileSignalsBandSkeleton({
  showCtaRow = true,
}: {
  showCtaRow?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Skeleton className="h-5 w-[7.5rem] rounded bg-foreground/[0.06]" />
        <Skeleton className="h-5 w-[4.5rem] rounded bg-foreground/[0.06]" />
        <Skeleton className="h-5 w-10 rounded bg-foreground/[0.06]" />
      </div>
      <Skeleton className="h-3 w-56 max-w-full bg-foreground/[0.05]" />
      {showCtaRow ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-6 w-6 rounded-md bg-foreground/[0.05]"
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-[4.5rem] rounded-full bg-foreground/[0.07]" />
            <Skeleton className="h-6 w-16 rounded-full bg-foreground/[0.07]" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use ProfileSignalsBandSkeleton */
export const ProfileSocialStripSkeleton = ProfileSignalsBandSkeleton;

/** @deprecated Use ProfileSignalsBandSkeleton */
export const ProfileSignalsSkeleton = ProfileSignalsBandSkeleton;
