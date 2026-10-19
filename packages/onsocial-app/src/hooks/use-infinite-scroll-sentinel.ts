'use client';

import { useEffect, type RefObject } from 'react';

export function useInfiniteScrollSentinel({
  scrollRootRef,
  root,
  sentinelRef,
  enabled,
  onIntersect,
  rootMargin = '160px 0px',
}: {
  scrollRootRef?: RefObject<Element | null>;
  /** Drawer scroller, when it is state rather than a ref. */
  root?: Element | null;
  sentinelRef: RefObject<Element | null>;
  enabled: boolean;
  onIntersect: () => void;
  rootMargin?: string;
}) {
  useEffect(() => {
    if (!enabled) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const scrollRoot = root !== undefined ? root : (scrollRootRef?.current ?? null);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onIntersect();
        }
      },
      { root: scrollRoot, rootMargin, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, onIntersect, root, rootMargin, scrollRootRef, sentinelRef]);
}
