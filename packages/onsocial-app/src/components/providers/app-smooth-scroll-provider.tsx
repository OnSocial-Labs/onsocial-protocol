'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import {
  APP_SMOOTH_SCROLL_LENIS_OPTIONS,
  APP_SMOOTH_SCROLL_ROOT_SELECTOR,
  APP_SMOOTH_WHEEL_MEDIA,
  isAppSmoothScrollLocked,
  shouldUseAppSmoothScroll,
} from '@/lib/app-smooth-scroll';

function bindAppSmoothScroll(wrapper: HTMLElement): () => void {
  const lenis = new Lenis({
    wrapper,
    content: wrapper,
    eventsTarget: wrapper,
    ...APP_SMOOTH_SCROLL_LENIS_OPTIONS,
  });

  const syncLock = () => {
    if (isAppSmoothScrollLocked(wrapper.dataset)) {
      lenis.stop();
    } else {
      lenis.start();
    }
  };
  syncLock();

  const lockObserver = new MutationObserver(syncLock);
  lockObserver.observe(wrapper, {
    attributes: true,
    attributeFilter: ['data-scroll-locked'],
  });

  return () => {
    lockObserver.disconnect();
    lenis.destroy();
  };
}

function bindAppSmoothScrollRoots(): () => void {
  const instances = new Map<HTMLElement, () => void>();
  let raf = 0;
  let enabled = shouldUseAppSmoothScroll();

  const sync = () => {
    raf = 0;
    if (!enabled) {
      for (const unbind of instances.values()) unbind();
      instances.clear();
      return;
    }

    const live = new Set(
      document.querySelectorAll<HTMLElement>(APP_SMOOTH_SCROLL_ROOT_SELECTOR)
    );

    for (const [element, unbind] of instances) {
      if (!live.has(element) || !element.isConnected) {
        unbind();
        instances.delete(element);
      }
    }

    for (const element of live) {
      if (!instances.has(element)) {
        instances.set(element, bindAppSmoothScroll(element));
      }
    }
  };

  const schedule = () => {
    if (raf !== 0) return;
    raf = window.requestAnimationFrame(sync);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });

  const mediaQueries = [
    window.matchMedia('(prefers-reduced-motion: reduce)'),
    window.matchMedia(APP_SMOOTH_WHEEL_MEDIA),
  ];
  const onMediaChange = () => {
    enabled = shouldUseAppSmoothScroll();
    schedule();
  };
  for (const query of mediaQueries) {
    query.addEventListener('change', onMediaChange);
  }

  sync();

  return () => {
    observer.disconnect();
    for (const query of mediaQueries) {
      query.removeEventListener('change', onMediaChange);
    }
    if (raf !== 0) window.cancelAnimationFrame(raf);
    for (const unbind of instances.values()) unbind();
    instances.clear();
  };
}

/** Wheel / trackpad coast on OS overflow roots. Phones stay on native overflow. */
export function AppSmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => bindAppSmoothScrollRoots(), []);
  return children;
}
