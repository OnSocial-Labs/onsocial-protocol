'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';

/**
 * Soft-appear for OsPageSheet body under stable chrome (back + title).
 * Pair the panel with `os-page-chrome-appear`. Omit `ready` to appear on mount;
 * pass `ready` when the body waits on a seed or fetch.
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
  const managed = ready !== undefined;
  const [autoReady, setAutoReady] = useState(false);
  useLayoutEffect(() => {
    if (!managed) setAutoReady(true);
  }, [managed]);
  const isReady = managed ? Boolean(ready) : autoReady;

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
