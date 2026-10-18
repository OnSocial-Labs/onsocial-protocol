'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';

/**
 * Dock Back for a detail opened from a catalog.
 * In this tab, pop the screen that opened it. A cold open uses the parent.
 */
export function useCatalogDockBack(fallbackHref: string): () => void {
  const router = useRouter();
  const popInApp = useOsInAppPop();
  const fallbackRef = useRef(fallbackHref);

  useLayoutEffect(() => {
    fallbackRef.current = fallbackHref;
  }, [fallbackHref]);

  return useCallback(() => {
    if (popInApp()) return;
    const href = fallbackRef.current.trim();
    if (href) router.push(href);
  }, [popInApp, router]);
}
