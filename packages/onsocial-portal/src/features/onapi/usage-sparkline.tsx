'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { UsageTimelinePoint } from '@/features/onapi/api';

type UsageSparklineProps = {
  points: UsageTimelinePoint[];
  bucketSec: number;
  className?: string;
  height?: number;
  loading?: boolean;
};

function formatBucketLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UsageSparkline({
  points,
  bucketSec,
  className,
  height = 44,
  loading = false,
}: UsageSparklineProps) {
  const maxCount = useMemo(
    () => Math.max(1, ...points.map((point) => point.count)),
    [points]
  );
  const hasTraffic = points.some((point) => point.count > 0);

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-md border border-border/30 bg-background/20',
          loading && 'animate-pulse'
        )}
        style={{ height }}
        role="img"
        aria-label={
          loading
            ? 'Loading API usage chart'
            : hasTraffic
              ? `API usage over the last ${points.length} buckets`
              : 'No API usage in the last hour'
        }
      >
        <div className="absolute inset-x-0 bottom-0 top-0 flex items-end gap-px px-0.5 pb-0.5 pt-2">
          {points.map((point) => {
            const totalHeight = Math.max(
              (point.count / maxCount) * (height - 10),
              point.count > 0 ? 2 : 1
            );
            const limitedHeight =
              point.count > 0
                ? (point.rateLimited / point.count) * totalHeight
                : 0;
            const successHeight = Math.max(totalHeight - limitedHeight, 0);

            return (
              <div
                key={point.t}
                className="group/bar relative min-w-0 flex-1"
                title={`${formatBucketLabel(point.t)} · ${point.count.toLocaleString()} req${
                  point.rateLimited > 0
                    ? ` · ${point.rateLimited.toLocaleString()} rate limited`
                    : ''
                }`}
              >
                <div
                  className="mx-auto flex w-full max-w-[10px] flex-col justify-end"
                  style={{ height: height - 10 }}
                >
                  {successHeight > 0 ? (
                    <div
                      className="w-full rounded-t-[1px] bg-[color-mix(in_srgb,var(--portal-blue)_72%,transparent)] transition-[height] duration-300"
                      style={{ height: successHeight }}
                    />
                  ) : null}
                  {limitedHeight > 0 ? (
                    <div
                      className="w-full rounded-t-[1px] bg-[color-mix(in_srgb,var(--portal-amber)_88%,transparent)] transition-[height] duration-300"
                      style={{ height: limitedHeight }}
                    />
                  ) : null}
                  {point.count === 0 ? (
                    <div className="h-px w-full bg-border/25" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 portal-type-caption text-muted-foreground/55">
        <span>Last {Math.round((points.length * bucketSec) / 60)} min</span>
        <span className="inline-flex items-center gap-2">
          <span className="max-md:hidden">Updates every 30s</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--portal-blue)_72%,transparent)]" />
            Requests
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--portal-amber)_88%,transparent)]" />
            429
          </span>
        </span>
      </div>
    </div>
  );
}
