'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';

/**
 * Dismiss a portfolio overlay drawer.
 * Always replace to the portfolio URL so intercept overlays reset reliably —
 * `back()` can leave the pathname on `/standing/...` while the sheet is gone,
 * which blocks the next signal tap (same href, no navigation, stuck Rendering).
 * In-sheet view switches still use `replace` so one dismiss never steps tabs.
 */
export function useOverlayClose(accountId: string) {
  const router = useRouter();

  return useCallback(() => {
    router.replace(portfolioPath(accountId), { scroll: false });
  }, [accountId, router]);
}
