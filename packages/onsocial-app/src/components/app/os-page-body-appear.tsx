'use client';

import { useLayoutEffect, useState, type PropsWithChildren } from 'react';

/**
 * Soft-appear for OsPageSheet body under stable chrome (back + title).
 * Pair the panel with `os-page-chrome-appear`. Omit `ready` to appear on mount;
 * pass `ready` when the body waits on land / seed (thread: hold opacity 0 —
 * `OsRouteSettle` keeps the skeleton cover until that gate opens).
 *
 * Unmanaged starts without `is-ready`, then flips after layout so the keyframe
 * runs once the sheet is in the tree (mounting ready can leave opacity at 0).
 */
export function OsPageBodyAppear({
  ready,
  present = false,
  children,
  className,
}: PropsWithChildren<{
  ready?: boolean;
  /**
   * Skip the 280ms fade when this body mounts already ready. Quotes omit
   * this so the sheet fade still runs.
   */
  present?: boolean;
  className?: string;
}>) {
  const managed = ready !== undefined;
  const [autoReady, setAutoReady] = useState(false);
  // Mounting already ready must not run the from-0 keyframe. That fade has
  // no skeleton behind it, so the header sits over an empty body.
  const [bornReady] = useState(() => present && managed && Boolean(ready));
  useLayoutEffect(() => {
    if (!managed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot appear after layout so opacity keyframe runs on a painted sheet
      setAutoReady(true);
    }
  }, [managed]);
  const isReady = managed ? Boolean(ready) : autoReady;

  return (
    <div
      className={[
        'os-page-body-appear',
        isReady ? 'is-ready' : '',
        bornReady && isReady ? 'is-present' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
