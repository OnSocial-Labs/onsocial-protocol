'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';

/**
 * Soft handoff off a route skeleton.
 * Omit `ready` to fade the skeleton out on the next layout (the page is
 * already painted underneath). Pass `ready` when the body must stay on the
 * existing appear — thread replies hold until `permalinkReady`.
 */
export function OsRouteSettle({
  ready,
  skeleton,
  children,
}: {
  ready?: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const managed = ready !== undefined;
  const [autoReady, setAutoReady] = useState(false);
  useLayoutEffect(() => {
    if (!managed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fade after layout, same gate as OsPageBodyAppear
      setAutoReady(true);
    }
  }, [managed]);
  const isReady = managed ? Boolean(ready) : autoReady;

  return (
    <div className="os-route-settle" aria-busy={isReady ? undefined : true}>
      {managed ? (
        <OsPageBodyAppear ready={isReady}>{children}</OsPageBodyAppear>
      ) : (
        children
      )}
      <div
        className={
          isReady ? 'os-route-skeleton is-done' : 'os-route-skeleton'
        }
        aria-hidden
      >
        {skeleton}
      </div>
    </div>
  );
}
