'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { APP_REWARD_REFRESH_DELAYS_MS } from '@/lib/app-reward-constants';
import {
  registerAppSocialBalanceRefresh,
  type AppSocialBalanceRefreshOptions,
} from '@/lib/app-social-balance-sync';

function parseBalanceYocto(value: string | undefined): bigint {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}

interface AppSocialBalanceContextValue {
  balanceYocto: bigint;
  hasLoadedBalance: boolean;
  loading: boolean;
  error: string | null;
  refresh: (options?: AppSocialBalanceRefreshOptions) => Promise<void>;
}

const AppSocialBalanceContext = createContext<AppSocialBalanceContextValue | null>(
  null
);

export function AppSocialBalanceProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAppWallet();
  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const balanceYoctoRef = useRef<bigint | null>(null);

  balanceYoctoRef.current = balanceYocto;

  const fetchBalance = useCallback(async (id: string): Promise<bigint> => {
    const response = await fetch(
      `/api/token/balance?accountId=${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );
    const payload = (await response.json().catch(() => null)) as {
      balanceYocto?: string;
      error?: string;
      detail?: string;
    } | null;

    if (!response.ok) {
      throw new Error(
        payload?.detail ?? payload?.error ?? `HTTP ${response.status}`
      );
    }

    return parseBalanceYocto(payload?.balanceYocto);
  }, []);

  const refresh = useCallback(
    async (options: AppSocialBalanceRefreshOptions = {}) => {
      if (!accountId) {
        return;
      }

      const requestId = ++requestIdRef.current;
      const showLoading = !options.silent && balanceYoctoRef.current === null;

      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      const delays = options.retry
        ? APP_REWARD_REFRESH_DELAYS_MS
        : ([0] as const);

      try {
        for (const delayMs of delays) {
          if (delayMs > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delayMs));
          }
          if (requestId !== requestIdRef.current) {
            return;
          }

          const nextBalance = await fetchBalance(accountId);
          if (requestId !== requestIdRef.current) {
            return;
          }

          setBalanceYocto(nextBalance);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Balance unavailable');
      } finally {
        if (requestId === requestIdRef.current && showLoading) {
          setLoading(false);
        }
      }
    },
    [accountId, fetchBalance]
  );

  useEffect(() => {
    if (!accountId) {
      setBalanceYocto(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextBalance = await fetchBalance(accountId);
        if (requestId !== requestIdRef.current) {
          return;
        }
        setBalanceYocto(nextBalance);
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
    })();
  }, [accountId, fetchBalance]);

  useEffect(() => {
    return registerAppSocialBalanceRefresh(refresh);
  }, [refresh]);

  const value = useMemo<AppSocialBalanceContextValue>(
    () => ({
      balanceYocto: balanceYocto ?? 0n,
      hasLoadedBalance: balanceYocto !== null,
      loading,
      error,
      refresh,
    }),
    [balanceYocto, error, loading, refresh]
  );

  return (
    <AppSocialBalanceContext.Provider value={value}>
      {children}
    </AppSocialBalanceContext.Provider>
  );
}

export function useAppSocialBalance() {
  const context = useContext(AppSocialBalanceContext);
  if (!context) {
    throw new Error(
      'useAppSocialBalance must be used within AppSocialBalanceProvider'
    );
  }
  return context;
}

/** Optional hook for surfaces that may mount outside the provider. */
export function useAppSocialBalanceOptional() {
  return useContext(AppSocialBalanceContext);
}
