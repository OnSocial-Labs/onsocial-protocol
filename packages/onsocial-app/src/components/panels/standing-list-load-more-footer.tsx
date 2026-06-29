'use client';

import type { RefObject } from 'react';
import {
  ProfileSocialListSkeleton,
  type ProfileSocialListSkeletonRowVariant,
} from '@/components/panels/profile-social-list-row';

export function StandingListLoadMoreFooter({
  loadMoreSentinelRef,
  resultsSummary,
  isLoadingMore,
  showSentinel,
  skeletonCount = 2,
  skeletonRowVariant = 'standing',
}: {
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  resultsSummary?: string | null;
  isLoadingMore: boolean;
  showSentinel: boolean;
  skeletonCount?: number;
  skeletonRowVariant?: ProfileSocialListSkeletonRowVariant;
}) {
  if (!showSentinel && !resultsSummary && !isLoadingMore) {
    return null;
  }

  return (
    <>
      {showSentinel ? (
        <div
          ref={loadMoreSentinelRef}
          className="standing-panel-sentinel"
          aria-hidden
        />
      ) : null}
      {resultsSummary ? (
        <p className="standing-panel-load-more-summary">{resultsSummary}</p>
      ) : null}
      {isLoadingMore ? (
        <ProfileSocialListSkeleton
          count={skeletonCount}
          variant="append"
          rowVariant={skeletonRowVariant}
        />
      ) : null}
    </>
  );
}
