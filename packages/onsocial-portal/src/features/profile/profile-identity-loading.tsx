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

export const profileIdentityTextClass =
  'min-w-0 flex-1 space-y-0.5 pb-1 pt-[calc(var(--profile-avatar-size)/2+0.375rem)]';

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
        <div className="flex items-start gap-3.5">
          <Skeleton
            className={cn(
              'shrink-0 rounded-2xl !border-[3px] !border-background',
              profileIdentityAvatarSizeClass
            )}
          />
          <div className={cn(profileIdentityTextClass, 'space-y-1.5')}>
            <Skeleton className="h-5 w-36 max-w-full bg-foreground/10" />
            <Skeleton className="h-3 w-48 max-w-full bg-foreground/[0.06]" />
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
          <>
            <Skeleton className="h-7 w-28 rounded-full bg-foreground/[0.07]" />
            <div className="space-y-2">
              <div className="flex items-start gap-6">
                <div className="space-y-1.5">
                  <Skeleton className="h-2 w-14" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-4 w-8 rounded" />
                    <Skeleton className="h-4 w-8 rounded" />
                    <Skeleton className="h-4 w-6 rounded" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-2 w-20" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-4 w-8 rounded" />
                    <Skeleton className="h-4 w-8 rounded" />
                  </div>
                </div>
              </div>
              <div className="flex -space-x-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-5 rounded-full" />
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

/** Inline social-strip skeleton (profile page, identity already visible). */
export function ProfileSocialStripSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-6">
        <div className="space-y-1.5">
          <Skeleton className="h-2 w-14" />
          <div className="flex gap-1.5">
            <Skeleton className="h-4 w-8 rounded" />
            <Skeleton className="h-4 w-8 rounded" />
            <Skeleton className="h-4 w-6 rounded" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-2 w-20" />
          <div className="flex gap-1.5">
            <Skeleton className="h-4 w-8 rounded" />
            <Skeleton className="h-4 w-8 rounded" />
          </div>
        </div>
      </div>
      <div className="flex -space-x-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-5 rounded-full" />
        ))}
      </div>
    </div>
  );
}
