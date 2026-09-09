'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { syncOsScreenChromeHeight } from '@/lib/os-screen-chrome-height';

/**
 * Measure resting glass chrome into `--os-screen-chrome-height`.
 * Freeze while `data-os-chrome-tucked` (search / toolbar tuck) is visual-only.
 */
export function useOsScreenChromeHeightSync({
  enabled,
  headerRef,
}: {
  enabled: boolean;
  headerRef: RefObject<HTMLElement | null>;
}): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const header = headerRef.current;
    if (!header) return;
    const screen = header.closest<HTMLElement>('.os-app-screen');
    const restingHeightRef = { current: 0 };

    const syncHeight = () => {
      syncOsScreenChromeHeight(screen, header, restingHeightRef);
    };
    const resizeObserver = new ResizeObserver(syncHeight);
    resizeObserver.observe(header);
    const mutationObserver = new MutationObserver(syncHeight);
    mutationObserver.observe(header, {
      attributes: true,
      attributeFilter: ['class', 'data-os-chrome-tucked'],
      subtree: true,
    });
    syncHeight();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      screen?.style.removeProperty('--os-screen-chrome-height');
    };
  }, [enabled, headerRef]);
}
