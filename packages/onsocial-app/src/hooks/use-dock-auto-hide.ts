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
 * Dock auto-hide: hide on scroll down, reveal on scroll up or near
 * the top. Listens in capture phase so nested scrollers (`.os-app-screen-body`)
 * count, not just the window.
 */
export function useDockAutoHide(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
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
      if (top <= TOP_REVEAL_PX || delta < -SHOW_DELTA_PX) {
        setHidden(false);
      } else if (delta > HIDE_DELTA_PX) {
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
  }, []);

  return hidden;
}
