'use client';

import {
  getPortalScrollY,
  setPortalScrollY,
  syncPortalScrollYFromWindow,
} from '@/lib/portal-scroll-state';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Scroll down past this → latch compact. */
const COMPACT_ENTER_SCROLL_Y = 56;
/** Scroll back above this → expand full rail. */
const COMPACT_EXIT_SCROLL_Y = 4;
/** Match morph duration — blocks scroll re-reads during height animation. */
const TOGGLE_LOCK_MS = 220;

function resolveCompactLatched(scrollY: number, current: boolean): boolean {
  if (scrollY > COMPACT_ENTER_SCROLL_Y) {
    return true;
  }
  if (scrollY < COMPACT_EXIT_SCROLL_Y) {
    return false;
  }
  return current;
}

function resolveCompactBootstrap(scrollY: number): boolean {
  if (scrollY > COMPACT_ENTER_SCROLL_Y) {
    return true;
  }
  if (scrollY < COMPACT_EXIT_SCROLL_Y) {
    return false;
  }
  return scrollY > (COMPACT_ENTER_SCROLL_Y + COMPACT_EXIT_SCROLL_Y) / 2;
}

function readScrollY(event?: Event): number {
  const detail = (event as CustomEvent<{ scroll?: number }> | undefined)
    ?.detail;
  if (typeof detail?.scroll === 'number') {
    setPortalScrollY(detail.scroll);
    return detail.scroll;
  }

  return getPortalScrollY();
}

/**
 * Scroll-position latch for compact rail (Lenis-safe).
 * Re-inits when pathname or sentinel node changes (client nav remounts).
 */
export function useGovernanceRailCompact(enabled: boolean) {
  const pathname = usePathname();
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node);
  }, []);
  const [compactRail, setCompactRail] = useState(false);
  const rafIdRef = useRef<number | undefined>(undefined);
  const lockedUntilRef = useRef(0);
  const compactRef = useRef(false);

  useEffect(() => {
    compactRef.current = compactRail;
  }, [compactRail]);

  useEffect(() => {
    if (!enabled || !sentinelNode) {
      setCompactRail(false);
      compactRef.current = false;
      lockedUntilRef.current = 0;
      return;
    }

    lockedUntilRef.current = 0;

    const applyCompact = (next: boolean) => {
      if (next === compactRef.current) {
        return;
      }

      lockedUntilRef.current = Date.now() + TOGGLE_LOCK_MS;
      compactRef.current = next;
      setCompactRail(next);
    };

    const bootstrap = (event?: Event) => {
      applyCompact(resolveCompactBootstrap(readScrollY(event)));
    };

    const sync = (event?: Event) => {
      if (rafIdRef.current !== undefined) {
        return;
      }

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = undefined;

        if (Date.now() < lockedUntilRef.current) {
          return;
        }

        applyCompact(
          resolveCompactLatched(readScrollY(event), compactRef.current)
        );
      });
    };

    syncPortalScrollYFromWindow();
    bootstrap();
    requestAnimationFrame(() => bootstrap());

    const restoreTimers = [
      window.setTimeout(() => bootstrap(), 50),
      window.setTimeout(() => bootstrap(), 150),
      window.setTimeout(() => bootstrap(), 400),
      window.setTimeout(() => bootstrap(), 1000),
    ];

    const handlePageShow = () => {
      lockedUntilRef.current = 0;
      syncPortalScrollYFromWindow();
      bootstrap();
    };

    const observer = new IntersectionObserver(
      () => {
        sync();
      },
      { threshold: [0, 1] }
    );

    observer.observe(sentinelNode);
    sync();

    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('touchmove', sync, { passive: true });
    window.addEventListener('wheel', sync, { passive: true });
    window.addEventListener('resize', sync);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('onsocial:smooth-scroll', sync);
    window.addEventListener('onsocial:scroll-restored', bootstrap);

    return () => {
      restoreTimers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      window.removeEventListener('scroll', sync);
      window.removeEventListener('touchmove', sync);
      window.removeEventListener('wheel', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('onsocial:smooth-scroll', sync);
      window.removeEventListener('onsocial:scroll-restored', bootstrap);
      if (rafIdRef.current !== undefined) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [enabled, pathname, sentinelNode]);

  return { sentinelRef, compactRail: enabled && compactRail };
}
