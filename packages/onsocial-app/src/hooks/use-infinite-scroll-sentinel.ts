'use client';

import { useEffect, type RefObject } from 'react';

export function useInfiniteScrollSentinel({
  scrollRootRef,
  sentinelRef,
  enabled,
  onIntersect,
  rootMargin = '160px 0px',
}: {
  scrollRootRef?: RefObject<Element | null>;
  sentinelRef: RefObject<Element | null>;
  enabled: boolean;
  onIntersect: () => void;
  rootMargin?: string;
}) {
  useEffect(() => {
    if (!enabled) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = scrollRootRef?.current ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onIntersect();
        }
      },
      { root, rootMargin, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, onIntersect, rootMargin, scrollRootRef, sentinelRef]);
}
