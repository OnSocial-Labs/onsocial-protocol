'use client';

import { useEffect, useState } from 'react';
import type { PortalProfileNearFacts } from '@/lib/portal-profile-near-facts';

interface ProfileNearFactsState {
  loading: boolean;
  error: string | null;
  facts: PortalProfileNearFacts | null;
}

const initialState: ProfileNearFactsState = {
  loading: false,
  error: null,
  facts: null,
};

export function useProfileNearFacts(
  accountId: string | null | undefined,
  enabled: boolean
): ProfileNearFactsState {
  const activeAccountId = enabled && accountId ? accountId : null;
  const [state, setState] = useState<ProfileNearFactsState>(initialState);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/profile/near-facts?accountId=${encodeURIComponent(activeAccountId)}`,
          { cache: 'no-store' }
        );
        const body = (await response.json().catch(() => null)) as
          | (Partial<PortalProfileNearFacts> & {
              error?: string;
              detail?: string;
            })
          | null;

        if (!response.ok) {
          throw new Error(
            body?.detail ??
              body?.error ??
              `NEAR account facts failed (${response.status})`
          );
        }

        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          facts: {
            accountId: body?.accountId ?? activeAccountId,
            network: body?.network ?? 'testnet',
            nearAccount: body?.nearAccount ?? null,
            nearAccountExplorerUrl:
              body?.nearAccountExplorerUrl ??
              `https://nearblocks.io/address/${activeAccountId}`,
            nearAccountCreation: body?.nearAccountCreation ?? null,
          },
        });
        setLoadedAccountId(activeAccountId);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load NEAR account facts',
          facts: null,
        });
        setLoadedAccountId(activeAccountId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId]);

  if (!activeAccountId) {
    return initialState;
  }

  if (loadedAccountId !== activeAccountId && !state.error) {
    return { ...initialState, loading: true };
  }

  return state;
}
