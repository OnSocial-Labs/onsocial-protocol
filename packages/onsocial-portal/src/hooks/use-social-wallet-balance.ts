'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function parseBalanceYocto(value: string | undefined): bigint {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}

/** SOCIAL wallet balance (NEP-141). Keeps last value while refreshing. */
export function useSocialWalletBalance(
  accountId: string | null,
  refreshKey = 0
) {
  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchBalance = useCallback(async (id: string) => {
    const requestId = ++requestIdRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(
        `/api/token/balance?accountId=${encodeURIComponent(id)}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json().catch(() => null)) as {
        balanceYocto?: string;
        error?: string;
        detail?: string;
      } | null;

      if (requestId !== requestIdRef.current || !mountedRef.current) return;

      if (!response.ok) {
        throw new Error(
          payload?.detail ?? payload?.error ?? `HTTP ${response.status}`
        );
      }

      setBalanceYocto(parseBalanceYocto(payload?.balanceYocto));
    } catch (err) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Balance unavailable');
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    if (!accountId) return;
    void fetchBalance(accountId);
  }, [accountId, fetchBalance]);

  useEffect(() => {
    if (!accountId) {
      if (mountedRef.current) {
        setBalanceYocto(null);
        setLoading(false);
        setError(null);
      }
      return;
    }

    void fetchBalance(accountId);
  }, [accountId, refreshKey, fetchBalance]);

  return {
    balanceYocto: balanceYocto ?? 0n,
    hasLoadedBalance: balanceYocto !== null,
    loading,
    error,
    refresh,
  };
}
