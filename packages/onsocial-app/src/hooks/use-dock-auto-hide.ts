'use client';

import { useEffect, useState } from 'react';

export const DOCK_HIDE_DELTA_PX = 14;
export const DOCK_SHOW_DELTA_PX = 8;
export const DOCK_TOP_REVEAL_PX = 48;

function scrollTopOf(target: EventTarget | null): number | null {
  if (target instanceof Element) return target.scrollTop;
  if (target instanceof Document) {
    return target.scrollingElement?.scrollTop ?? null;
  }
  return null;
}

/**
 * Dock auto-hide: hide on scroll down, reveal on scroll up or near the top.
 *
 * - Default: window capture so nested scrollers (`.os-app-screen-body`) count.
 * - Pass `scrollRoot` to bind a specific scroller (page drawer body).
 * - Pass `pinned` while commit chrome is up so save/refresh scroll cannot tuck
 *   the dock away.
 * - Bump `hideRequest` to force a hide (e.g. after a section jump).
 */
export function useDockAutoHide(
  pinned = false,
  scrollRoot: Element | null = null,
  hideRequest = 0
): boolean {
  const [hidden, setHidden] = useState(false);

  // Clear scroll-hide when commit chrome pins the dock (render-time adjust).
  if (pinned && hidden) {
    setHidden(false);
  }

  useEffect(() => {
    if (hideRequest > 0 && !pinned) {
      setHidden(true);
    }
  }, [hideRequest, pinned]);

  useEffect(() => {
    if (pinned || !scrollRoot) {
      return;
    }

    let lastTop = scrollRoot.scrollTop;

    const onScroll = (event: Event) => {
      if (event.target !== scrollRoot) return;
      const top = scrollRoot.scrollTop;
      const last = lastTop;
      lastTop = top;
      const delta = top - last;
      if (top <= DOCK_TOP_REVEAL_PX || delta < -DOCK_SHOW_DELTA_PX) {
        setHidden(false);
      } else if (delta > DOCK_HIDE_DELTA_PX) {
        setHidden(true);
      }
    };

    scrollRoot.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      scrollRoot.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pinned, scrollRoot]);

  useEffect(() => {
    if (pinned || scrollRoot) {
      return;
    }

    const lastTops = new WeakMap<EventTarget, number>();

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!target) return;
      const top = scrollTopOf(target);
      if (top == null) return;

      const last = lastTops.get(target);
      lastTops.set(target, top);
      if (last === undefined) return;

      const delta = top - last;
      if (top <= DOCK_TOP_REVEAL_PX || delta < -DOCK_SHOW_DELTA_PX) {
        setHidden(false);
      } else if (delta > DOCK_HIDE_DELTA_PX) {
        setHidden(true);
      }
    };

    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pinned, scrollRoot]);

  return pinned ? false : hidden;
}
