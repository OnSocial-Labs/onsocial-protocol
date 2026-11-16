import type { ReactNode } from 'react';

/**
 * One-line catalog status. Stable line box (`min-height` on
 * `.market-page-status`). Use `reserved` only while a hint is undecided
 * above an already-painted band — never delay that band to wait on it.
 */
export function CatalogStatusLine({
  children,
  reserved = false,
}: {
  children?: ReactNode;
  reserved?: boolean;
}) {
  const empty = children == null || children === false || children === '';
  if (empty && !reserved) return null;
  return (
    <p
      className={`market-page-status${reserved && empty ? ' is-reserved' : ''}`}
      aria-hidden={reserved && empty ? true : undefined}
    >
      {empty ? '\u00a0' : children}
    </p>
  );
}
