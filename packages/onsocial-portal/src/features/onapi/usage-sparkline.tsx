'use client';

import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageTimelinePoint } from '@/features/onapi/api';
import { computeUsageRpmStats, formatCompactUsage } from '@/features/onapi/api';

type UsageSparklineProps = {
  points: UsageTimelinePoint[];
  bucketSec: number;
  className?: string;
  height?: number;
  loading?: boolean;
  /** Tier burst RPM — draws a dashed reference line when set. */
  burstLimitPerMin?: number;
  burstAccentColor?: string;
  /** Relative refresh label, e.g. "12s ago". */
  updatedLabel?: string | null;
};

type BarTone = 'idle' | 'normal' | 'spike';

function formatBucketLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCompactCount(value: number): string {
  return formatCompactUsage(value);
}

function resolveBarTone(
  point: UsageTimelinePoint,
  peak: number,
  burstLimitPerMin?: number
): BarTone {
  if (point.count === 0) return 'idle';
  const allowed = Math.max(0, point.count - point.rateLimited);
  if (
    burstLimitPerMin != null &&
    burstLimitPerMin > 0 &&
    allowed >= burstLimitPerMin * 0.92
  ) {
    return 'spike';
  }
  if (peak > 0 && point.count >= peak * 0.72) return 'spike';
  return 'normal';
}

const allowedBarClass: Record<Exclude<BarTone, 'idle'>, string> = {
  normal: 'bg-[color-mix(in_srgb,var(--portal-blue)_58%,transparent)]',
  spike:
    'bg-[color-mix(in_srgb,var(--portal-purple)_82%,transparent)] shadow-[0_0_8px_color-mix(in_srgb,var(--portal-purple)_35%,transparent)]',
};

/** Matches bar column `pt-5` / `pb-0.5` in the chart shell. */
const CHART_PAD_TOP = 20;
const CHART_PAD_BOTTOM = 2;

function chartPlotHeight(height: number): number {
  return height - CHART_PAD_TOP - CHART_PAD_BOTTOM;
}

function ChartTimeLabel({
  time,
  className,
}: {
  time: string;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular-nums', className)}
    >
      <Clock className="h-3 w-3 shrink-0 opacity-45" aria-hidden />
      <span>{time}</span>
    </span>
  );
}

export function UsageSparkline({
  points,
  bucketSec,
  className,
  height = 56,
  loading = false,
  burstLimitPerMin,
  burstAccentColor,
  updatedLabel,
}: UsageSparklineProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const stats = useMemo(
    () => computeUsageRpmStats(points, bucketSec, burstLimitPerMin),
    [points, bucketSec, burstLimitPerMin]
  );

  const plotHeight = chartPlotHeight(height);
  const maxCount = Math.max(1, stats.peak, burstLimitPerMin ?? 0);
  const burstLineOffset =
    burstLimitPerMin != null && burstLimitPerMin > 0
      ? (burstLimitPerMin / maxCount) * plotHeight
      : null;
  const burstLabelBelow =
    burstLineOffset != null && burstLineOffset > plotHeight * 0.62;
  const hasBurstLine = burstLineOffset != null;
  const hasTraffic = stats.total > 0;
  const activePoint =
    activeIndex != null && activeIndex >= 0 ? points[activeIndex] : null;
  const activeAllowed = activePoint
    ? Math.max(0, activePoint.count - activePoint.rateLimited)
    : 0;
  const activeOver = activePoint?.rateLimited ?? 0;

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 portal-type-caption text-muted-foreground/70">
          <span>
            Now{' '}
            <span className="font-mono text-xs font-semibold portal-blue-text">
              {formatCompactCount(stats.nowRpm)}
            </span>
          </span>
          <span className="text-border/80">·</span>
          <span>
            Avg{' '}
            <span className="font-mono text-xs font-semibold text-foreground/85">
              {formatCompactCount(stats.avgRpm)}
            </span>
            <span className="text-muted-foreground/45">/min</span>
          </span>
        </div>
        {stats.peakAt ? (
          <span className="hidden shrink-0 items-center gap-1 portal-type-caption text-muted-foreground/45 md:inline-flex">
            <span>Busiest</span>
            <ChartTimeLabel time={formatBucketLabel(stats.peakAt)} />
          </span>
        ) : null}
      </div>

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
              ? `API usage over the last ${points.length} minutes, now ${stats.nowRpm} per minute, ${stats.limited} over limit in the last hour`
              : 'No API usage in the last hour'
        }
      >
        {activePoint ? (
          <div
            className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-md border border-border/40 bg-background/95 px-2 py-1 text-center shadow-sm backdrop-blur-sm"
            aria-live="polite"
          >
            <p className="font-mono text-[11px] font-semibold leading-none text-foreground">
              {activeOver > 0 ? (
                <>
                  <span className="portal-blue-text">
                    {activeAllowed.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground/35"> / </span>
                  <span className="portal-amber-text">
                    {activeOver.toLocaleString()}
                  </span>
                </>
              ) : (
                activeAllowed.toLocaleString()
              )}
            </p>
            <p className="mt-0.5 portal-type-caption text-muted-foreground/60">
              <ChartTimeLabel time={formatBucketLabel(activePoint.t)} />
            </p>
          </div>
        ) : null}

        {hasBurstLine ? (
          <div
            className="pointer-events-none absolute inset-x-1 z-20"
            style={{ bottom: CHART_PAD_BOTTOM + burstLineOffset! }}
            aria-hidden
          >
            <div
              className="h-px w-full border-t border-dashed"
              style={{
                borderColor:
                  burstAccentColor ??
                  'color-mix(in srgb, var(--muted-foreground) 70%, transparent)',
                opacity: 0.72,
              }}
            />
            <span
              className={cn(
                'absolute left-0 max-w-[calc(100%-0.25rem)] truncate rounded-sm bg-background/80 px-1 py-px font-mono text-[9px] font-medium leading-none tabular-nums backdrop-blur-[2px]',
                burstLabelBelow
                  ? 'top-0.5 text-muted-foreground/70'
                  : 'bottom-full mb-0.5 text-muted-foreground/65'
              )}
              style={
                burstAccentColor
                  ? {
                      color: `color-mix(in srgb, ${burstAccentColor} 78%, var(--foreground))`,
                    }
                  : undefined
              }
            >
              Cap {formatCompactCount(burstLimitPerMin!)}
            </span>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 top-0 flex items-end gap-px px-0.5 pb-0.5 pt-5">
          {points.map((point, index) => {
            const tone = resolveBarTone(point, stats.peak, burstLimitPerMin);
            const allowed = Math.max(0, point.count - point.rateLimited);
            const allowedHeight =
              point.count > 0 ? (allowed / maxCount) * plotHeight : 0;
            const overHeight =
              point.count > 0 ? (point.rateLimited / maxCount) * plotHeight : 0;
            const isActive = activeIndex === index;
            const overCap =
              burstLimitPerMin != null &&
              burstLimitPerMin > 0 &&
              point.rateLimited > 0;

            return (
              <button
                key={point.t}
                type="button"
                className={cn(
                  'group/bar relative min-w-0 flex-1 cursor-crosshair rounded-sm outline-none transition-opacity',
                  isActive && 'opacity-100',
                  !isActive && activeIndex != null && 'opacity-55',
                  overCap && !isActive && 'opacity-90'
                )}
                title={
                  point.rateLimited > 0
                    ? `${formatBucketLabel(point.t)} · ${allowed.toLocaleString()} / ${point.rateLimited.toLocaleString()}`
                    : `${formatBucketLabel(point.t)} · ${allowed.toLocaleString()}`
                }
                aria-label={`${formatBucketLabel(point.t)}, ${allowed} allowed${
                  point.rateLimited > 0
                    ? `, ${point.rateLimited} over limit`
                    : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() =>
                  setActiveIndex((current) =>
                    current === index ? null : current
                  )
                }
                onFocus={() => setActiveIndex(index)}
                onBlur={() =>
                  setActiveIndex((current) =>
                    current === index ? null : current
                  )
                }
                onClick={() =>
                  setActiveIndex((current) =>
                    current === index ? null : index
                  )
                }
              >
                <div
                  className={cn(
                    'mx-auto flex w-full max-w-[10px] flex-col justify-end transition-transform duration-150',
                    (isActive || tone === 'spike') && 'scale-x-110'
                  )}
                  style={{ height: plotHeight }}
                >
                  {allowedHeight > 0 ? (
                    <div
                      className={cn(
                        'w-full rounded-t-[2px] transition-[height] duration-300',
                        allowedBarClass[tone === 'idle' ? 'normal' : tone]
                      )}
                      style={{ height: allowedHeight }}
                    />
                  ) : null}
                  {overHeight > 0 ? (
                    <div
                      className="w-full rounded-t-[2px] bg-[color-mix(in_srgb,var(--portal-amber)_95%,transparent)] transition-[height] duration-300"
                      style={{ height: overHeight }}
                    />
                  ) : null}
                  {point.count === 0 ? (
                    <div className="h-px w-full bg-border/25" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 portal-type-caption text-muted-foreground/55">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>Last {Math.round((points.length * bucketSec) / 60)} min</span>
          {updatedLabel ? (
            <span className="text-muted-foreground/40">
              · Updated {updatedLabel}
            </span>
          ) : null}
          {stats.peakAt ? (
            <span className="md:hidden">
              · Busiest {formatBucketLabel(stats.peakAt)}
            </span>
          ) : null}
        </span>
        <span className="hidden flex-wrap items-center justify-end gap-x-2 gap-y-0.5 md:inline-flex">
          <span>Hover or tap a bar</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--portal-blue)_58%,transparent)]" />
            Allowed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--portal-amber)_88%,transparent)]" />
            Over
          </span>
          {hasBurstLine ? (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-3 border-t border-dashed opacity-70"
                style={{
                  borderColor:
                    burstAccentColor ??
                    'color-mix(in srgb, var(--muted-foreground) 70%, transparent)',
                }}
              />
              Cap
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
