'use client';

import type { ReactNode } from 'react';

export const OVERLAY_INTERCEPT_ROOT = Symbol.for('onsocial.overlay.intercept');

/** Marks @overlay intercept routes (soft nav). Absent on `default.tsx` / hard refresh. */
export function OverlayInterceptRoot({ children }: { children: ReactNode }) {
  return (
    <>
      <span data-testid="overlay-intercept-slot" hidden aria-hidden />
      {children}
    </>
  );
}

OverlayInterceptRoot.overlayIntercept = OVERLAY_INTERCEPT_ROOT;
