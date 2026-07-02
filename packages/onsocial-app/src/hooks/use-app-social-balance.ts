'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';

function parseBalanceYocto(value: string | undefined): bigint {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}

/** SOCIAL wallet balance for the connected account. */
export function useAppSocialBalance(
  accountId: string | null,
  enabled: boolean
) {
  const { getClient } = useAppOnSocialClient();
  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!accountId || !enabled) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const { client } = await getClient();
      const nextBalance = await client.token.balanceOf(accountId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setBalanceYocto(parseBalanceYocto(nextBalance));
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Balance unavailable');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [accountId, enabled, getClient]);

  useEffect(() => {
    if (!accountId || !enabled) {
      setBalanceYocto(null);
      setLoading(false);
      setError(null);
      return;
    }

    void refresh();
  }, [accountId, enabled, refresh]);

  return {
    balanceYocto: balanceYocto ?? 0n,
    hasLoadedBalance: balanceYocto !== null,
    loading,
    error,
    refresh,
  };
}
