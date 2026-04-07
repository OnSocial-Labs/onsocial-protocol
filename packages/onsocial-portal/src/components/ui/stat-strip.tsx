import * as React from 'react';
import { cn } from '@/lib/utils';
import { InsetDividerItem } from './inset-divider-group';

/* ── container ──────────────────────────────────────────────────── */

interface StatStripProps {
  children: React.ReactNode;
  /** Number of columns. Partial last rows are automatically centered. */
  columns?: number;
  /** Columns on mobile (<768px). Falls back to `columns` when omitted. */
  mobileColumns?: number;
  className?: string;
  /** Extra classes on the outer wrapper. */
  groupClassName?: string;
}

export function StatStrip({
  children,
  columns = 3,
  mobileColumns,
  className,
  groupClassName,
}: StatStripProps) {
  return (
    <div className={cn(groupClassName)}>
      <div className="h-px w-full divider-section" />
      <div
        className={cn('flex flex-wrap justify-center text-center', className)}
        style={{ '--stat-cols': columns } as React.CSSProperties}
        {...(mobileColumns != null && { 'data-mobile-cols': mobileColumns })}
      >
        {children}
      </div>
      <div className="h-px w-full divider-section" />
    </div>
  );
}

/* ── cell ────────────────────────────────────────────────────────── */

interface StatStripCellProps {
  label: string;
  /** Simple string value — rendered as mono text. Use `children` for complex content. */
  value?: string;
  children?: React.ReactNode;
  /** Icon rendered before the label. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Extra class on the icon element. */
  iconClassName?: string;
  /** Extra class on the value `<p>` (accent colors, etc.). */
  valueClassName?: string;
  /** Whether to show the divider after this cell. */
  showDivider?: boolean;
  /** Divider orientation mode. */
  dividerMode?: 'vertical' | 'responsive';
  /** Extra class on the divider span. */
  dividerClassName?: string;
  /**
   * Cell density:
   *   `"sm"` — compact overview strips (px-2 py-2.5 → md:px-4 md:py-3)
   *   `"md"` — balance/eligibility strips (px-3 py-3 → md:px-4 md:py-3.5)
   */
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'px-2 py-2.5 md:px-4 md:py-3',
  md: 'px-3 py-3 md:px-4 md:py-3.5',
} as const;

export function StatStripCell({
  label,
  value,
  children,
  icon: Icon,
  iconClassName,
  valueClassName,
  showDivider = false,
  dividerMode = 'vertical',
  dividerClassName,
  size = 'sm',
}: StatStripCellProps) {
  return (
    <InsetDividerItem
      className={sizeClasses[size]}
      style={{ width: 'calc(100% / var(--stat-cols))' }}
      showDivider={showDivider}
      dividerMode={dividerMode}
      dividerClassName={dividerClassName}
    >
      <span
        className={cn(
          'text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:text-[11px]',
          Icon && 'flex items-center justify-center gap-1.5'
        )}
      >
        {Icon ? <Icon className={cn('h-3 w-3', iconClassName)} /> : null}
        {label}
      </span>
      {children != null ? (
        <div className="mt-1">{children}</div>
      ) : (
        <p
          className={cn(
            'mt-1 truncate font-mono text-sm font-bold md:text-base',
            valueClassName ?? 'text-foreground/80'
          )}
        >
          {value}
        </p>
      )}
    </InsetDividerItem>
  );
}
