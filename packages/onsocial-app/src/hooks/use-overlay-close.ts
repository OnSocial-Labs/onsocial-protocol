'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';
import { portfolioPath } from '@/lib/overlay-routes';

/**
 * Dismiss a portfolio overlay drawer.
 * Pop when this sheet was opened in the tab, so the face underneath is the
 * same history entry the person was opened on. Replacing the sheet URL with
 * the face leaves that face in history twice, and the next Back stays put.
 * If the pop does not leave the overlay (no entry underneath), replace onto
 * the face — a leftover `/standing/...` URL with the sheet gone blocks the
 * next signal tap. In-sheet view switches still use `replace`.
 */
export function useOverlayClose(accountId: string) {
  const router = useRouter();
  const popInApp = useOsInAppPop();

  return useCallback(() => {
    const face = portfolioPath(accountId);
    const before = window.location.pathname;
    if (!popInApp()) {
      router.replace(face, { scroll: false });
      return;
    }
    const timer = window.setTimeout(() => {
      if (window.location.pathname === before) {
        router.replace(face, { scroll: false });
      }
    }, 400);
    window.addEventListener(
      'popstate',
      () => {
        window.clearTimeout(timer);
      },
      { once: true }
    );
  }, [accountId, popInApp, router]);
}
