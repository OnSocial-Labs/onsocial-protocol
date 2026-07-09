'use client';

import { useEffect, useState } from 'react';

const HIDE_DELTA_PX = 14;
const SHOW_DELTA_PX = 8;
const TOP_REVEAL_PX = 48;

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
 */
export function useDockAutoHide(
  pinned = false,
  scrollRoot: Element | null = null
): boolean {
  const [hidden, setHidden] = useState(false);
  const scoped = scrollRoot != null;

  // Clear scroll-hide when commit chrome pins the dock (render-time adjust).
  if (pinned && hidden) {
    setHidden(false);
  }

  useEffect(() => {
    if (pinned) {
      setHidden(false);
      return;
    }
    if (scoped && !scrollRoot) {
      setHidden(false);
      return;
    }

    let lastTop: number | undefined;
    const lastTops = new WeakMap<EventTarget, number>();

    const applyDelta = (top: number, last: number | undefined) => {
      if (last === undefined) return;
      const delta = top - last;
      if (top <= TOP_REVEAL_PX || delta < -SHOW_DELTA_PX) {
        setHidden(false);
      } else if (delta > HIDE_DELTA_PX) {
        setHidden(true);
      }
    };

    const onScroll = (event: Event) => {
      if (scoped && scrollRoot) {
        // Capture may see nested scrollers; only react to this root.
        if (event.target !== scrollRoot) return;
        const top = scrollRoot.scrollTop;
        const last = lastTop;
        lastTop = top;
        applyDelta(top, last);
        return;
      }

      const target = event.target;
      if (!target) return;
      const top = scrollTopOf(target);
      if (top == null) return;

      const last = lastTops.get(target);
      lastTops.set(target, top);
      applyDelta(top, last);
    };

    if (scoped && scrollRoot) {
      lastTop = scrollRoot.scrollTop;
      scrollRoot.addEventListener('scroll', onScroll, {
        passive: true,
        capture: true,
      });
      return () => {
        scrollRoot.removeEventListener('scroll', onScroll, { capture: true });
      };
    }

    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pinned, scoped, scrollRoot]);

  return pinned ? false : hidden;
}
