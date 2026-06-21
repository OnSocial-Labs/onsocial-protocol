import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-full bg-foreground/[0.08]',
        className
      )}
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
            'h-3 rounded-full bg-foreground/[0.06]',
            widths?.[index] ?? (index === lines - 1 ? 'w-4/5' : 'w-full'),
            lineClassName
          )}
        />
      ))}
    </div>
  );
}

export function StatStripSkeleton({
  items = 4,
  columns = 4,
  mobileColumns,
  size = 'sm',
  showTopDivider = true,
  showBottomDivider = true,
  groupClassName,
  className,
}: {
  items?: number;
  columns?: number;
  mobileColumns?: number;
  size?: 'sm' | 'md';
  showTopDivider?: boolean;
  showBottomDivider?: boolean;
  groupClassName?: string;
  className?: string;
}) {
  const resolvedMobileColumns = mobileColumns ?? (columns > 3 ? 2 : undefined);
  const useMobileGrid =
    resolvedMobileColumns != null && resolvedMobileColumns < columns;
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-2.5 md:px-4 md:py-3'
      : 'px-3 py-3 md:px-4 md:py-3.5';
  const cellWidthStyle = {
    flex: '0 0 calc(100% / var(--stat-cols))',
    width: 'calc(100% / var(--stat-cols))',
    maxWidth: 'calc(100% / var(--stat-cols))',
  } as CSSProperties;

  return (
    <div className={groupClassName}>
      {showTopDivider ? <div className="h-px w-full divider-section" /> : null}
      <div
        className={cn(
          'stat-strip-cells w-full text-center',
          useMobileGrid
            ? 'stat-strip-responsive flex flex-wrap justify-center max-md:grid max-md:justify-items-center max-md:[grid-template-columns:repeat(var(--stat-cols),minmax(0,1fr))]'
            : 'flex flex-wrap justify-center',
          className
        )}
        data-stat-cols={columns}
        {...(useMobileGrid && {
          'data-mobile-cols': resolvedMobileColumns,
        })}
      >
        {Array.from({ length: items }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'stat-strip-cell relative flex min-w-0 flex-col items-center justify-center',
              sizeClasses,
              !useMobileGrid && 'shrink-0'
            )}
            style={useMobileGrid ? undefined : cellWidthStyle}
          >
            <Skeleton className="h-3 w-14 rounded-full bg-foreground/[0.06]" />
            <Skeleton className="mt-1.5 h-5 w-16 rounded-full bg-foreground/[0.09]" />
          </div>
        ))}
      </div>
      {showBottomDivider ? (
        <div className="h-px w-full divider-section" />
      ) : null}
    </div>
  );
}

/** Tabbed amount form — matches Position delegate / undelegate / withdraw. */
export function CompactActionSkeleton({
  tabCount = 3,
  className,
}: {
  tabCount?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: tabCount }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-7 w-20 rounded-full bg-foreground/[0.06]"
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-14 rounded-full bg-foreground/[0.06]" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-14 rounded-full bg-foreground/[0.06]" />
              <Skeleton className="h-7 w-10 rounded-full bg-foreground/[0.06]" />
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-border/40 bg-background/45 px-3 py-3 md:gap-3 md:px-4 md:py-3.5">
            <Skeleton className="h-5 w-12 max-w-[4rem] flex-1 rounded-full bg-foreground/[0.07]" />
            <Skeleton className="h-5 w-16 shrink-0 rounded-full bg-foreground/[0.06]" />
          </div>
        </div>

        <div className="min-h-[1.25rem]">
          <Skeleton className="h-4 w-56 max-w-full rounded-full bg-foreground/[0.05]" />
        </div>

        <Skeleton className="h-11 w-full rounded-full bg-foreground/10" />
      </div>
    </div>
  );
}

/** Single CTA block — matches Partners eligibility “What’s next”. */
export function EligibilityNextStepSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className="h-3 w-24 rounded-full bg-foreground/[0.06]" />
      <SkeletonText lines={2} widths={['w-full', 'w-4/5']} />
      <Skeleton className="h-11 w-full rounded-full bg-foreground/10 sm:max-w-xs" />
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
          <Skeleton className="h-7 w-24 rounded-full bg-foreground/10" />
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
          <Skeleton className="h-8 w-20 rounded-full bg-foreground/[0.06]" />
        ) : null}
      </div>
      <Skeleton className="h-7 w-3/5 rounded-full bg-foreground/[0.09]" />
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
            <Skeleton className="h-4 w-2/5 rounded-full bg-foreground/[0.07]" />
            <Skeleton className="mt-3 h-3 w-full rounded-full bg-foreground/5" />
          </div>
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 w-28 rounded-full bg-foreground/10" />
        <Skeleton className="h-10 w-24 rounded-full bg-foreground/[0.06]" />
      </div>
    </div>
  );
}

export function ListRowsSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divider-detail', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3 md:px-5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full bg-foreground/[0.06]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 max-w-full rounded-full bg-foreground/[0.08]" />
            <Skeleton className="h-3 w-48 max-w-full rounded-full bg-foreground/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BillingPanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-16 rounded-full bg-foreground/[0.08]" />
        <Skeleton className="h-4 w-24 rounded-full bg-foreground/[0.06]" />
      </div>
      <StatStripSkeleton columns={2} items={2} showTopDivider={false} />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-32 rounded-full bg-foreground/10" />
        <Skeleton className="h-10 w-28 rounded-full bg-foreground/[0.06]" />
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
              <Skeleton className="h-5 w-2/5 rounded-full bg-foreground/10" />
              <Skeleton className="h-3 w-full rounded-full bg-foreground/[0.06]" />
              <Skeleton className="h-3 w-3/4 rounded-full bg-foreground/[0.06]" />
            </div>
            <Skeleton className="h-8 w-16 rounded-full bg-foreground/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}
