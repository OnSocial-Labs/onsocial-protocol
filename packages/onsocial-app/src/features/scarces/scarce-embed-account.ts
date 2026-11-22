'use client';

import { useEffect, useRef } from 'react';
import { clearScarceEmbedOverrides } from '@/features/scarces/scarce-embed-ledger';

function accountKey(accountId: string | null | undefined): string | null {
  const trimmed = accountId?.trim().toLowerCase() ?? '';
  return trimmed || null;
}

/**
 * Optimistic scarce CTAs belong to the viewer who signed them. Drop them
 * when that account changes. The first observation only records the account.
 */
export function useResetScarceEmbedOverrides(
  accountId: string | null | undefined
): void {
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const next = accountKey(accountId);
    const prior = previous.current;
    previous.current = next;
    if (prior !== undefined && prior !== next) {
      clearScarceEmbedOverrides();
    }
  }, [accountId]);
}
