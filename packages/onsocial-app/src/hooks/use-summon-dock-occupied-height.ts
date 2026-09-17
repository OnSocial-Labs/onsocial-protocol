'use client';

import { useLayoutEffect, type RefObject } from 'react';

const OCCUPIED_VAR = '--os-summon-dock-occupied';

/**
 * Publish the live summon dock height onto the host `.os-app-screen` so feed
 * body padding can keep a constant air gap above the dock as it folds/expands.
 * Does not move the dock — scroller clearance only.
 */
export function useSummonDockOccupiedHeight(
  dockRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const dock = dockRef.current;
    if (!dock) return;
    const screen = dock.closest<HTMLElement>('.os-app-screen');

    const sync = () => {
      const height = Math.ceil(dock.getBoundingClientRect().height);
      const value = `${Math.max(0, height)}px`;
      dock.style.setProperty(OCCUPIED_VAR, value);
      screen?.style.setProperty(OCCUPIED_VAR, value);
    };

    sync();
    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(dock);
    return () => {
      resizeObserver.disconnect();
      dock.style.removeProperty(OCCUPIED_VAR);
      screen?.style.removeProperty(OCCUPIED_VAR);
    };
  }, [dockRef, enabled]);
}
