'use client';

import { useEffect, useState } from 'react';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import {
  buildUserStorageSummary,
  type UserStorageSummary,
} from '@/lib/user-storage-display';

interface UserStorageBalanceState {
  loading: boolean;
  error: string | null;
  summary: UserStorageSummary | null;
}

const initialState: UserStorageBalanceState = {
  loading: false,
  error: null,
  summary: null,
};

export function useUserStorageBalance(
  accountId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0
): UserStorageBalanceState {
  const activeAccountId = enabled && accountId ? accountId : null;
  const [state, setState] = useState<UserStorageBalanceState>(initialState);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }

    let cancelled = false;
    const os = createPortalOnSocialClient();

    void (async () => {
      try {
        const balance = await os.storageAccount.balance(activeAccountId);
        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          summary: buildUserStorageSummary(balance),
        });
        setLoadedAccountId(activeAccountId);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load your storage',
          summary: null,
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
