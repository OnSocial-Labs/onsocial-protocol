'use client';

import type { ReactNode } from 'react';

/**
 * Soft-appear for OsPageSheet body under stable chrome (back + title).
 * Pair the panel with `os-page-chrome-appear`. Omit `ready` to appear on mount;
 * pass `ready` when the body waits on a seed or fetch.
 *
 * Unmanaged mounts with `is-ready` so the CSS keyframe runs on insert.
 * Managed waits for `ready` before applying the class.
 */
export function OsPageBodyAppear({
  ready,
  children,
  className,
}: {
  ready?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const isReady = ready === undefined ? true : Boolean(ready);

  return (
    <div
      className={[
        'os-page-body-appear',
        isReady ? 'is-ready' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
