import * as React from 'react';
import { cn } from '@/lib/utils';
import { InsetDividerItem } from './inset-divider-group';

/* ── layout context ─────────────────────────────────────────────── */

interface StatStripLayoutContextValue {
  index: number;
  total: number;
  columns: number;
  mobileColumns?: number;
}

const StatStripLayoutContext =
  React.createContext<StatStripLayoutContextValue | null>(null);

type CellDividerState = {
  showMobile: boolean;
  showDesktop: boolean;
};

function resolveCellDividers(
  layout: StatStripLayoutContextValue | null,
  showDivider: boolean
): CellDividerState {
  if (!showDivider || !layout || layout.index >= layout.total - 1) {
    return { showMobile: false, showDesktop: false };
  }

  const { index, columns, mobileColumns } = layout;
  const mobileCols = mobileColumns ?? columns;

  return {
    showMobile: (index + 1) % mobileCols !== 0,
    showDesktop: (index + 1) % columns !== 0,
  };
}

function CellDividerSpans({
  dividers,
  dividerClassName,
}: {
  dividers: CellDividerState;
  dividerClassName?: string;
}) {
  const verticalClass =
    'absolute top-0 right-0 z-[1] h-full w-px divider-v-detail';

  if (!dividers.showMobile && !dividers.showDesktop) {
    return null;
  }

  return (
    <span
      aria-hidden
      className={cn(
        verticalClass,
        dividers.showMobile && !dividers.showDesktop && 'md:hidden',
        !dividers.showMobile && dividers.showDesktop && 'max-md:hidden',
        dividerClassName
      )}
    />
  );
}

function shouldInsertRowBreak(
  index: number,
  columns: number,
  mobileColumns?: number
) {
  if (index <= 0) {
    return { mobile: false, desktop: false };
  }

  const needsDesktopRowBreak = index % columns === 0;
  const needsMobileRowBreak =
    mobileColumns != null &&
    mobileColumns < columns &&
    index % mobileColumns === 0;

  return {
    mobile: needsMobileRowBreak,
    desktop: needsDesktopRowBreak,
  };
}

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
  /** Show the horizontal rule above the strip. Defaults to true. */
  showTopDivider?: boolean;
  /** Show the horizontal rule below the strip. Defaults to true. */
  showBottomDivider?: boolean;
}

function resolveMobileColumns(columns: number, mobileColumns?: number) {
  // Only collapse 4+ column strips on mobile; 3-across keeps vertical dividers intact.
  return mobileColumns ?? (columns > 3 ? 2 : undefined);
}

export function StatStrip({
  children,
  columns = 3,
  mobileColumns,
  className,
  groupClassName,
  showTopDivider = true,
  showBottomDivider = true,
}: StatStripProps) {
  const items = React.Children.toArray(children);
  const resolvedMobileColumns = resolveMobileColumns(columns, mobileColumns);
  const useMobileGrid =
    resolvedMobileColumns != null && resolvedMobileColumns < columns;

  return (
    <div className={cn(groupClassName)}>
      {showTopDivider ? <div className="h-px w-full divider-section" /> : null}
      <div
        className={cn(
          'stat-strip-cells w-full text-center',
          useMobileGrid
            ? 'flex flex-wrap justify-center max-md:grid max-md:justify-items-center max-md:[grid-template-columns:repeat(var(--stat-cols),minmax(0,1fr))]'
            : 'flex flex-wrap justify-center',
          className
        )}
        style={{ '--stat-cols': columns } as React.CSSProperties}
        data-stat-cols={columns}
        {...(useMobileGrid && {
          'data-mobile-cols': resolvedMobileColumns,
        })}
      >
        {items.map((child, index) => (
          <React.Fragment
            key={
              React.isValidElement(child) && child.key != null
                ? String(child.key)
                : index
            }
          >
            {(() => {
              const rowBreak = shouldInsertRowBreak(
                index,
                columns,
                resolvedMobileColumns
              );

              if (!rowBreak.mobile && !rowBreak.desktop) {
                return null;
              }

              return (
                <div
                  aria-hidden
                  className={cn(
                    'h-px w-full divider-section',
                    rowBreak.mobile &&
                      'max-md:col-span-full max-md:[grid-column:1/-1]',
                    rowBreak.desktop && 'md:basis-full',
                    rowBreak.mobile && !rowBreak.desktop && 'md:hidden',
                    !rowBreak.mobile && rowBreak.desktop && 'max-md:hidden'
                  )}
                />
              );
            })()}
            <StatStripLayoutContext.Provider
              value={{
                index,
                total: items.length,
                columns,
                mobileColumns: resolvedMobileColumns,
              }}
            >
              {child}
            </StatStripLayoutContext.Provider>
          </React.Fragment>
        ))}
      </div>
      {showBottomDivider ? (
        <div className="h-px w-full divider-section" />
      ) : null}
    </div>
  );
}

/* ── cell ────────────────────────────────────────────────────────── */

interface StatStripCellProps {
  label: React.ReactNode;
  /** Shorter label on viewports below md when the desktop label is too long. */
  mobileLabel?: React.ReactNode;
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

const cellWidthStyle = {
  flex: '0 0 calc(100% / var(--stat-cols))',
  width: 'calc(100% / var(--stat-cols))',
  maxWidth: 'calc(100% / var(--stat-cols))',
} as React.CSSProperties;

export function StatStripCell({
  label,
  mobileLabel,
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
  const layout = React.useContext(StatStripLayoutContext);
  const dividers = resolveCellDividers(layout, showDivider);
  const useLayoutDividers = layout != null;

  const labelNode = (
    <span
      className={cn(
        'portal-eyebrow break-words text-muted-foreground',
        Icon && 'flex items-center justify-center gap-1.5',
        mobileLabel != null &&
          'inline-flex flex-col items-center gap-0.5 md:block'
      )}
    >
      {Icon ? <Icon className={cn('h-3 w-3', iconClassName)} /> : null}
      {mobileLabel != null ? (
        <>
          <span className="md:hidden">{mobileLabel}</span>
          <span className="max-md:hidden">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  );

  const valueNode =
    children != null ? (
      <div className="mt-1">{children}</div>
    ) : (
      <p
        className={cn(
          'mt-1 break-words font-mono font-bold leading-snug',
          size === 'sm' ? 'text-xs md:text-sm' : 'text-sm md:text-base',
          valueClassName ?? 'text-portal-neutral font-semibold tracking-tight'
        )}
      >
        {value}
      </p>
    );

  if (!useLayoutDividers) {
    return (
      <InsetDividerItem
        className={sizeClasses[size]}
        style={cellWidthStyle}
        showDivider={showDivider}
        dividerMode={dividerMode}
        dividerClassName={dividerClassName}
      >
        {labelNode}
        {valueNode}
      </InsetDividerItem>
    );
  }

  return (
    <div
      className={cn('relative min-w-0', sizeClasses[size])}
      style={cellWidthStyle}
    >
      {labelNode}
      {valueNode}
      <CellDividerSpans
        dividers={dividers}
        dividerClassName={dividerClassName}
      />
    </div>
  );
}
