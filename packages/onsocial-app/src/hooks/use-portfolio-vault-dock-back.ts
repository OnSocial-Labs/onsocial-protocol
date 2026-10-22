'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  useOsInAppPop,
  useOsPreviousInAppHref,
} from '@/components/providers/os-face-leave-provider';
import { portfolioVaultBackPops } from '@/features/collectibles/collectibles-vault-leave';

/**
 * Portfolio vault dock Back.
 * Same face: one step back (the Collectibles drawer, when that opened it).
 * Another face or a cold open: the drawer for this vault.
 */
export function usePortfolioVaultDockBack(
  accountId: string | null | undefined,
  fallbackHref: string
): () => void {
  const router = useRouter();
  const popInApp = useOsInAppPop();
  const previousHref = useOsPreviousInAppHref();
  const accountRef = useRef(accountId);
  const fallbackRef = useRef(fallbackHref);

  useLayoutEffect(() => {
    accountRef.current = accountId;
    fallbackRef.current = fallbackHref;
  }, [accountId, fallbackHref]);

  return useCallback(() => {
    const sameFace = portfolioVaultBackPops(
      accountRef.current,
      previousHref()
    );
    if (sameFace && popInApp()) return;
    const href = fallbackRef.current.trim();
    if (href) router.push(href);
  }, [popInApp, previousHref, router]);
}
