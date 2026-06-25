'use client';

import { useEffect, useState } from 'react';
import type { PlatformAllowanceInfo } from '@onsocial/sdk';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import {
  buildPlatformStorageSummary,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';

interface PlatformStorageSummaryState {
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
  rawAllowance: PlatformAllowanceInfo | null;
}

const initialState: PlatformStorageSummaryState = {
  loading: false,
  error: null,
  summary: null,
  rawAllowance: null,
};

export function usePlatformStorageSummary(
  accountId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0
): PlatformStorageSummaryState {
  const activeAccountId = enabled && accountId ? accountId : null;
  const [state, setState] = useState<PlatformStorageSummaryState>(initialState);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }

    let cancelled = false;
    const os = createPortalOnSocialClient();

    void (async () => {
      try {
        const [allowance, balance] = await Promise.all([
          os.storageAccount.platformAllowance(activeAccountId),
          os.storageAccount.balance(activeAccountId),
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          rawAllowance: allowance,
          summary: buildPlatformStorageSummary(allowance, balance),
        });
        setLoadedAccountId(activeAccountId);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load platform storage',
          summary: null,
          rawAllowance: null,
        });
        setLoadedAccountId(activeAccountId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, refreshKey]);

  if (!activeAccountId) {
    return initialState;
  }

  if (loadedAccountId !== activeAccountId && !state.error) {
    return { ...initialState, loading: true };
  }

  return state;
}
