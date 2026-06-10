'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';

export function useOverlayClose(accountId: string) {
  const router = useRouter();

  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(portfolioPath(accountId));
  }, [accountId, router]);
}
