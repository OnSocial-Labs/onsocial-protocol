'use client';

import { useEffect, useMemo, useRef } from 'react';
import Lenis from 'lenis';
import { usePathname, useSearchParams } from 'next/navigation';

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

export function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lenisRef = useRef<Lenis | null>(null);
  const isPopNavigationRef = useRef(false);
  const hasMountedRef = useRef(false);
  const routeKeyRef = useRef(pathname);
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
    });
    lenisRef.current = lenis;

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

    const handlePopState = () => {
      isPopNavigationRef.current = true;
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const saveCurrentRoutePosition = () => {
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
      routeKeyRef.current = routeKey;
      writeScrollPosition(routeKey, window.scrollY);
      return;
    }

    writeScrollPosition(routeKeyRef.current, window.scrollY);
    routeKeyRef.current = routeKey;

    const nextScrollTop = readScrollPosition(routeKey);
    const isPopNavigation = isPopNavigationRef.current;

    isPopNavigationRef.current = false;

    if (!isPopNavigation || nextScrollTop <= 0) {
      lenisRef.current?.scrollTo(0, { immediate: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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
    }, 2500);
  }, [routeKey]);

  return <>{children}</>;
}
