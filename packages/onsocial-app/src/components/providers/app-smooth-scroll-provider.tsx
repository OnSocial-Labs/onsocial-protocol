'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import {
  APP_SMOOTH_SCROLL_LENIS_OPTIONS,
  APP_SMOOTH_SCROLL_ROOT_SELECTOR,
  isAppSmoothScrollLocked,
  prefersReducedMotion,
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
  let reduced = prefersReducedMotion();

  const sync = () => {
    raf = 0;
    if (reduced) {
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

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionChange = () => {
    reduced = motionQuery.matches;
    schedule();
  };
  motionQuery.addEventListener('change', onMotionChange);

  sync();

  return () => {
    observer.disconnect();
    motionQuery.removeEventListener('change', onMotionChange);
    if (raf !== 0) window.cancelAnimationFrame(raf);
    for (const unbind of instances.values()) unbind();
    instances.clear();
  };
}

/** Soft wheel / trackpad coast on every OS overflow root — same Lenis feel as portal. */
export function AppSmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => bindAppSmoothScrollRoots(), []);
  return children;
}
