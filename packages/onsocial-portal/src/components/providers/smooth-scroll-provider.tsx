'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Lenis from 'lenis';
import {
  resetPortalScrollY,
  setPortalScrollY,
} from '@/lib/portal-scroll-state';
import { usePathname, useSearchParams } from 'next/navigation';

/** Minimal Navigation API shape — not yet in every TS lib.dom version. */
type NavigateEventLike = {
  navigationType?: string;
  destination?: { url?: string };
};
type NavigationLike = {
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEventLike) => void
  ): void;
  removeEventListener(
    type: 'navigate',
    listener: (event: NavigateEventLike) => void
  ): void;
};

const SCROLL_STORAGE_PREFIX = 'onsocial:scroll:';

function readScrollPosition(routeKey: string): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const value = window.sessionStorage.getItem(
    `${SCROLL_STORAGE_PREFIX}${routeKey}`
  );
  const parsed = value ? Number.parseFloat(value) : 0;

  return Number.isFinite(parsed) ? parsed : 0;
}

function writeScrollPosition(routeKey: string, scrollTop: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    `${SCROLL_STORAGE_PREFIX}${routeKey}`,
    String(scrollTop)
  );
}

/**
 * All scroll logic lives here, isolated behind the provider's own Suspense
 * boundary: useSearchParams suspends during prerender, and this keeps that
 * suspension from forcing the whole app tree into a client-only shell.
 * Renders nothing — every effect operates on window/document.
 */
function SmoothScrollController() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lenisRef = useRef<Lenis | null>(null);
  const isPopNavigationRef = useRef(false);
  const hasMountedRef = useRef(false);
  const routeKeyRef = useRef('');
  const lastScrollYRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const restoreTimeoutRef = useRef<number | null>(null);
  const restoreObserverRef = useRef<ResizeObserver | null>(null);
  const routeKey = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const clearPendingRestore = () => {
    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }

    if (restoreTimeoutRef.current !== null) {
      window.clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }

    restoreObserverRef.current?.disconnect();
    restoreObserverRef.current = null;
  };

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.5,
      smoothWheel: true,
      prevent: (node) =>
        node instanceof Element &&
        node.closest('[data-lenis-prevent]') !== null,
    });
    lenisRef.current = lenis;

    const emitSmoothScroll = (instance: Lenis) => {
      setPortalScrollY(instance.scroll);
      window.dispatchEvent(
        new CustomEvent('onsocial:smooth-scroll', {
          detail: { scroll: instance.scroll },
        })
      );
    };

    lenis.on('scroll', emitSmoothScroll);

    const handleScrollTo = (event: Event) => {
      const top =
        (event as CustomEvent<{ top?: number; immediate?: boolean }>).detail
          ?.top ?? 0;
      const immediate = Boolean(
        (event as CustomEvent<{ top?: number; immediate?: boolean }>).detail
          ?.immediate
      );
      lenis.scrollTo(top, { immediate });
    };

    window.addEventListener('onsocial:scroll-to', handleScrollTo);

    const handleScrollLock = (event: Event) => {
      const locked = Boolean(
        (event as CustomEvent<{ locked?: boolean }>).detail?.locked
      );
      if (locked) {
        lenis.stop();
      } else {
        lenis.start();
      }
    };

    window.addEventListener('onsocial:scroll-lock', handleScrollLock);

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      clearPendingRestore();

      lenis.off('scroll', emitSmoothScroll);
      window.removeEventListener('onsocial:scroll-to', handleScrollTo);
      window.removeEventListener('onsocial:scroll-lock', handleScrollLock);
      lenisRef.current = null;
      lenis.destroy();

      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto';
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // React 19 intercepts history traversals through the Navigation API and
    // commits the route change before the browser dispatches `popstate`, so a
    // popstate listener alone fires too late to flag a back/forward
    // navigation. The Navigation API's `navigate` event fires before the
    // commit; popstate stays as the fallback for browsers without it.
    const locationKey = () =>
      `${window.location.pathname}${window.location.search}`;

    const handlePopState = () => {
      if (locationKey() === routeKeyRef.current) {
        // Late popstate: React already committed this traversal. Re-arming
        // here would mislabel the next plain link push as a back/forward
        // navigation and wrongly restore an old position.
        return;
      }
      isPopNavigationRef.current = true;
    };

    window.addEventListener('popstate', handlePopState);

    const navigation = (window as unknown as { navigation?: NavigationLike })
      .navigation;

    const handleNavigate = (event: NavigateEventLike) => {
      if (event.navigationType !== 'traverse') {
        return;
      }
      try {
        const destination = new URL(
          event.destination?.url ?? '',
          window.location.href
        );
        // Traversals that keep the same route key (hash-only) never reach the
        // routeKey effect; arming the flag would leak into the next push.
        if (
          `${destination.pathname}${destination.search}` === routeKeyRef.current
        ) {
          return;
        }
      } catch {
        // Unparseable destination — still treat as a pop navigation.
      }
      isPopNavigationRef.current = true;
    };

    navigation?.addEventListener('navigate', handleNavigate);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      navigation?.removeEventListener('navigate', handleNavigate);
    };
  }, []);

  // Swap the active route key in a layout effect: child layout effects run
  // before the router's own scroll-to-top, so the outgoing route keeps the
  // position captured from real scroll events instead of reading
  // window.scrollY after Next has already zeroed it.
  useLayoutEffect(() => {
    if (!routeKey || routeKeyRef.current === routeKey) {
      return;
    }
    if (routeKeyRef.current) {
      writeScrollPosition(routeKeyRef.current, lastScrollYRef.current);
    }
    routeKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const saveCurrentRoutePosition = () => {
      if (!routeKeyRef.current) {
        return;
      }
      lastScrollYRef.current = window.scrollY;
      writeScrollPosition(routeKeyRef.current, window.scrollY);
    };

    const handleScroll = () => {
      if (scrollFrameRef.current !== null) {
        return;
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        saveCurrentRoutePosition();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', saveCurrentRoutePosition);

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }

      clearPendingRestore();

      saveCurrentRoutePosition();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', saveCurrentRoutePosition);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    clearPendingRestore();

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      writeScrollPosition(routeKey, window.scrollY);
      return;
    }

    const emitScrollRestored = (scroll = 0) => {
      setPortalScrollY(scroll);
      window.dispatchEvent(
        new CustomEvent('onsocial:scroll-restored', {
          detail: { scroll },
        })
      );
    };

    const nextScrollTop = readScrollPosition(routeKey);
    const isPopNavigation = isPopNavigationRef.current;

    isPopNavigationRef.current = false;
    resetPortalScrollY(0);

    if (!isPopNavigation || nextScrollTop <= 0) {
      lenisRef.current?.scrollTo(0, { immediate: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      requestAnimationFrame(() => emitScrollRestored(0));
      return;
    }

    lenisRef.current?.scrollTo(0, { immediate: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    const attemptRestore = () => {
      const maxScrollTop = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const canReachTarget = maxScrollTop >= nextScrollTop - 24;
      const clampedScrollTop = Math.min(nextScrollTop, maxScrollTop);

      if (canReachTarget) {
        lenisRef.current?.scrollTo(clampedScrollTop, { immediate: true });
        window.scrollTo({ top: clampedScrollTop, left: 0, behavior: 'auto' });
        clearPendingRestore();
        emitScrollRestored(clampedScrollTop);
        return;
      }
    };

    restoreFrameRef.current = window.requestAnimationFrame(() => {
      restoreFrameRef.current = null;
      attemptRestore();
    });

    restoreObserverRef.current = new ResizeObserver(() => {
      attemptRestore();
    });
    restoreObserverRef.current.observe(document.documentElement);

    restoreTimeoutRef.current = window.setTimeout(() => {
      const maxScrollTop = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const clampedScrollTop = Math.min(nextScrollTop, maxScrollTop);

      lenisRef.current?.scrollTo(clampedScrollTop, { immediate: true });
      window.scrollTo({ top: clampedScrollTop, left: 0, behavior: 'auto' });
      clearPendingRestore();
      emitScrollRestored(clampedScrollTop);
    }, 2500);
  }, [routeKey]);

  return null;
}

export function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <SmoothScrollController />
      </Suspense>
      {children}
    </>
  );
}
