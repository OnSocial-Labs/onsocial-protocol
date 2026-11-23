'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useOsInAppHrefs } from '@/components/providers/os-face-leave-provider';
import { resolveWritingShelfLeaveHref } from '@/lib/overlay-routes';

/**
 * Solid Writing dock Back.
 * Leave Writing for Collectibles / Drops / feed — never a drop under
 * Collectibles, and never an article under the shelf.
 */
export function useWritingShelfDockBack(accountId: string): () => void {
  const router = useRouter();
  const trail = useOsInAppHrefs();
  const accountRef = useRef(accountId);

  useLayoutEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);

  return useCallback(() => {
    const search = typeof window === 'undefined' ? '' : window.location.search;
    router.push(
      resolveWritingShelfLeaveHref(accountRef.current, search, trail())
    );
  }, [router, trail]);
}
