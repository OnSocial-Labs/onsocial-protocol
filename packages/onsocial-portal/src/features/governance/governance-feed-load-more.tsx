'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function GovernanceFeedLoadMore({
  hasMore,
  onLoadMore,
  loadMoreSentinelRef,
  endSummary,
  className,
}: {
  hasMore: boolean;
  onLoadMore: () => void;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  endSummary?: string | null;
  className?: string;
}) {
  if (!hasMore && !endSummary) {
    return null;
  }

  return (
    <div className={cn('pt-2', className)}>
      {hasMore ? (
        <>
          <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden />
          <div className="flex justify-center pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadMore}
            >
              Load more
            </Button>
          </div>
        </>
      ) : null}
      {!hasMore && endSummary ? (
        <p className="py-3 text-center portal-type-label text-muted-foreground/55">
          {endSummary}
        </p>
      ) : null}
    </div>
  );
}
