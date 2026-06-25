'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { Skeleton } from '@/components/ui/skeleton';
import {
  profileListResultSkeletonRowClass,
  profileListContainerClass,
} from '@/features/profile/profile-list-row';
import { cn } from '@/lib/utils';

export type ProfileListSkeletonVariant =
  | 'profile'
  | 'discovery'
  | 'endorsement';

function ProfileListProfileSkeletonRow() {
  return (
    <div className={profileListResultSkeletonRowClass}>
      <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-foreground/[0.08]" />
      <span className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36 max-w-full bg-foreground/[0.08]" />
        <Skeleton className="h-3 w-48 max-w-full bg-foreground/5" />
      </span>
    </div>
  );
}

function ProfileListDiscoverySkeletonRow() {
  return (
    <div className={profileListResultSkeletonRowClass}>
      <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-foreground/[0.08]" />
      <span className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36 max-w-full bg-foreground/[0.08]" />
        <Skeleton className="h-3 w-48 max-w-full bg-foreground/5" />
        <Skeleton className="h-3 w-40 max-w-full bg-foreground/5" />
      </span>
      <Skeleton className="h-7 w-20 shrink-0 rounded-full bg-foreground/[0.08]" />
    </div>
  );
}

function ProfileListEndorsementSkeletonRow() {
  return (
    <div className="space-y-2 px-2 py-2">
      <Skeleton className="h-4 w-28 bg-foreground/[0.08]" />
      <Skeleton className="h-3 w-full max-w-sm bg-foreground/5" />
      <Skeleton className="h-px w-full divider-detail bg-foreground/5" />
      <Skeleton className="h-3 w-44 bg-foreground/5" />
    </div>
  );
}

export function ProfileListSkeletonRows({
  variant = 'profile',
  count = 6,
  className,
}: {
  variant?: ProfileListSkeletonVariant;
  count?: number;
  className?: string;
}) {
  const Row =
    variant === 'discovery'
      ? ProfileListDiscoverySkeletonRow
      : variant === 'endorsement'
        ? ProfileListEndorsementSkeletonRow
        : ProfileListProfileSkeletonRow;

  return (
    <div className={cn(profileListContainerClass, className)} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <Row key={index} />
      ))}
    </div>
  );
}

export function ProfileListLoadMoreFooter({
  loadMoreSentinelRef,
  resultsSummary,
  isLoadingMore,
  skeletonVariant = 'profile',
  skeletonCount = 3,
  className,
}: {
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  resultsSummary?: string | null;
  isLoadingMore: boolean;
  skeletonVariant?: ProfileListSkeletonVariant;
  skeletonCount?: number;
  className?: string;
}) {
  return (
    <>
      <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden />
      {resultsSummary ? (
        <div className={cn('px-2.5 py-3 text-center', className)}>
          <p className="portal-type-label text-muted-foreground/55">
            {resultsSummary}
          </p>
        </div>
      ) : null}
      {isLoadingMore ? (
        <ProfileListSkeletonRows
          variant={skeletonVariant}
          count={skeletonCount}
          className={resultsSummary ? 'pt-0' : undefined}
        />
      ) : null}
    </>
  );
}

export function ProfileViewAllButton({
  onClick,
  ariaLabel,
  label = 'View all',
  className,
}: {
  onClick: () => void;
  ariaLabel: string;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={onClick}
      className={cn('gap-1.5 px-2.5', className)}
      aria-label={ariaLabel}
    >
      {label}
      <ProtocolMotionArrow className="h-3 w-3" />
    </Button>
  );
}
