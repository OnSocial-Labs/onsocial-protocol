import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-full bg-white/8', className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
  lineClassName,
  widths,
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
  widths?: string[];
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            'h-3 rounded-full bg-white/6',
            widths?.[index] ?? (index === lines - 1 ? 'w-4/5' : 'w-full'),
            lineClassName
          )}
        />
      ))}
    </div>
  );
}

export function StatGridSkeleton({
  items = 3,
  className,
  itemClassName,
}: {
  items?: number;
  className?: string;
  itemClassName?: string;
}) {
  const gridClassName =
    items <= 1 ? 'grid-cols-1' : items === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={cn('grid gap-3', gridClassName, className)}>
      {Array.from({ length: items }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'rounded-[1rem] border border-border/30 bg-background/20 p-4 space-y-3',
            itemClassName
          )}
        >
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({
  className,
  minHeight,
  showAction = true,
  detailLines = 2,
  statBlocks = 2,
}: {
  className?: string;
  minHeight?: string;
  showAction?: boolean;
  detailLines?: number;
  statBlocks?: number;
}) {
  const style = minHeight ? ({ minHeight } as CSSProperties) : undefined;

  return (
    <div className={cn('space-y-4', className)} style={style}>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-32 rounded-full" />
        {showAction ? (
          <Skeleton className="h-8 w-20 rounded-full bg-white/6" />
        ) : null}
      </div>
      <Skeleton className="h-7 w-3/5 rounded-full bg-white/9" />
      <SkeletonText lines={detailLines} />
      {statBlocks > 0 ? <StatGridSkeleton items={statBlocks} /> : null}
    </div>
  );
}

export function FormSkeleton({
  fields = 4,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-5', className)}>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-24 rounded-full" />
          <div className="rounded-[1rem] border border-border/30 bg-background/20 p-4">
            <Skeleton className="h-4 w-2/5 rounded-full bg-white/7" />
            <Skeleton className="mt-3 h-3 w-full rounded-full bg-white/5" />
          </div>
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 w-28 rounded-full bg-white/10" />
        <Skeleton className="h-10 w-24 rounded-full bg-white/6" />
      </div>
    </div>
  );
}

export function TableSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-[1.25rem] border border-border/35 bg-background/25 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-5 w-2/5 rounded-full bg-white/10" />
              <Skeleton className="h-3 w-full rounded-full bg-white/6" />
              <Skeleton className="h-3 w-3/4 rounded-full bg-white/6" />
            </div>
            <Skeleton className="h-8 w-16 rounded-full bg-white/7" />
          </div>
        </div>
      ))}
    </div>
  );
}
