'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.js';

/**
 * Shared label/value facts chrome for hug sheets (guild / hub / collection /
 * scarce / page-joined). Pair with `os-sheet-facts.css`.
 * Class aliases: `.guild-facts-*` (legacy app selectors).
 */

export function SheetFactSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('os-sheet-facts-section', 'guild-facts-section', className)}
    >
      <h3 className="os-sheet-facts-section-title guild-facts-section-title">
        {title}
      </h3>
      <div className="os-sheet-facts-section-rows guild-facts-section-rows">
        {children}
      </div>
    </section>
  );
}

export function SheetFactRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('os-sheet-facts-row', 'guild-facts-row', className)}>
      <span className="os-sheet-facts-label guild-facts-label">{label}</span>
      <span className="os-sheet-facts-value guild-facts-value">{value}</span>
    </div>
  );
}

/** Quiet supporting line under a row — indented to the value column. */
export function SheetFactCopy({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('os-sheet-facts-copy', 'guild-facts-copy', className)}>
      {children}
    </p>
  );
}

/** Emphasized count + optional unit in the value column. */
export function SheetFactCount({
  count,
  unit,
  loading = false,
  className,
}: {
  count: ReactNode;
  unit?: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'os-sheet-facts-count-value',
        'guild-facts-count-value',
        loading && 'is-loading',
        className
      )}
      {...(loading ? { 'aria-hidden': true } : {})}
    >
      <span className="os-sheet-facts-count guild-facts-count">{count}</span>
      {unit ? (
        <span className="os-sheet-facts-unit guild-facts-unit"> {unit}</span>
      ) : null}
    </span>
  );
}
