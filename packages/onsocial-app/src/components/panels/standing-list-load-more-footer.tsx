'use client';

import type { RefObject } from 'react';
import { PulsingDots } from '@onsocial/ui';

export function StandingListLoadMoreFooter({
  loadMoreSentinelRef,
  resultsSummary,
  isLoadingMore,
  showSentinel,
}: {
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  resultsSummary?: string | null;
  isLoadingMore: boolean;
  showSentinel: boolean;
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
        <div className="list-append-pending">
          <PulsingDots size="sm" label="Loading more" />
        </div>
      ) : null}
    </>
  );
}
