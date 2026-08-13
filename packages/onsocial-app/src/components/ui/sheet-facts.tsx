'use client';

import type { ReactNode } from 'react';

/**
 * Shared label/value facts chrome for hug sheets (guild / hub / collection /
 * scarce / page-joined). Styles live on `.guild-facts-*` in globals.css.
 */

export function SheetFactSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guild-facts-section">
      <h3 className="guild-facts-section-title">{title}</h3>
      <div className="guild-facts-section-rows">{children}</div>
    </section>
  );
}

export function SheetFactRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="guild-facts-row">
      <span className="guild-facts-label">{label}</span>
      <span className="guild-facts-value">{value}</span>
    </div>
  );
}

/** Quiet supporting line under a row — indented to the value column. */
export function SheetFactCopy({ children }: { children: ReactNode }) {
  return <p className="guild-facts-copy">{children}</p>;
}

/** Emphasized count + optional unit in the value column. */
export function SheetFactCount({
  count,
  unit,
  loading = false,
}: {
  count: ReactNode;
  unit?: string;
  loading?: boolean;
}) {
  return (
    <span
      className={
        loading
          ? 'guild-facts-count-value is-loading'
          : 'guild-facts-count-value'
      }
      {...(loading ? { 'aria-hidden': true } : {})}
    >
      <span className="guild-facts-count">{count}</span>
      {unit ? <span className="guild-facts-unit"> {unit}</span> : null}
    </span>
  );
}
