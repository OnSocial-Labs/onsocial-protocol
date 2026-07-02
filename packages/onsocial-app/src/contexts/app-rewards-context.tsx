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
import {
  APP_REWARD_MIN_CLAIM_YOCTO,
  APP_REWARD_REFRESH_DELAYS_MS,
} from '@/lib/app-reward-constants';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';

interface RewardsOverview {
  claimable: string;
  total_earned: string;
  total_claimed: string;
}

interface RefreshRewardsOptions {
  silent?: boolean;
  fresh?: boolean;
}

interface AppRewardsContextValue {
  claimableYocto: bigint;
  canClaim: boolean;
  claiming: boolean;
  remainingToClaimYocto: bigint;
  loading: boolean;
  refreshRewards: (options?: RefreshRewardsOptions) => Promise<void>;
  claimRewards: () => Promise<void>;
}

interface AppRewardToast {
  type: 'pending' | 'success' | 'error';
  message: string;
  explorerHref?: string | null;
}

const AppRewardsContext = createContext<AppRewardsContextValue | null>(null);

function parseYocto(value: string | undefined): bigint {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}

function nearblocksTxHref(txHash: string | null | undefined): string | null {
  const hash = typeof txHash === 'string' ? txHash.trim() : '';
  return hash ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${hash}` : null;
}

export function useAppRewards() {
  const context = useContext(AppRewardsContext);
  if (!context) {
    throw new Error('useAppRewards must be used within AppRewardsProvider');
  }
  return context;
}

export function AppRewardsProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAppWallet();
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimBarHoldYocto, setClaimBarHoldYocto] = useState<bigint | null>(
    null
  );
  const [toast, setToast] = useState<AppRewardToast | null>(null);
  const refreshGenerationRef = useRef(0);

  const fetchRewards = useCallback(async (): Promise<void> => {
    if (!accountId) {
      setOverview(null);
      return;
    }

    const response = await fetch(
      `/api/rewards/overview?accountId=${encodeURIComponent(accountId)}`,
      { cache: 'no-store' }
    );
    const body = (await response.json().catch(() => null)) as {
      overview?: RewardsOverview | null;
      error?: string;
      detail?: string;
    } | null;

    if (!response.ok) {
      throw new Error(
        body?.detail ?? body?.error ?? `Rewards lookup failed (${response.status})`
      );
    }

    setOverview(body?.overview ?? null);
  }, [accountId]);

  const refreshRewards = useCallback(
    async (options: RefreshRewardsOptions = {}) => {
      if (!accountId) {
        setOverview(null);
        return;
      }

      if (!options.silent) {
        setLoading(true);
      }

      try {
        await fetchRewards();
      } catch {
        setOverview(null);
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [accountId, fetchRewards]
  );

  const refreshRewardsWithRetry = useCallback(
    async (options: RefreshRewardsOptions = {}) => {
      const generation = refreshGenerationRef.current + 1;
      refreshGenerationRef.current = generation;

      if (!options.silent) {
        setLoading(true);
      }

      for (const delayMs of APP_REWARD_REFRESH_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (refreshGenerationRef.current !== generation) {
          return;
        }

        try {
          await fetchRewards();
        } catch {
          if (!options.silent) {
            setOverview(null);
          }
        }
      }

      if (!options.silent) {
        setLoading(false);
      }
    },
    [fetchRewards]
  );

  useEffect(() => {
    void refreshRewards();
  }, [refreshRewards]);

  useEffect(() => {
    setClaimBarHoldYocto(null);
  }, [accountId]);

  useEffect(() => {
    if (!toast || toast.type === 'pending') {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const claimRewards = useCallback(async () => {
    if (!accountId || claiming) {
      return;
    }

    const claimableSnapshot = parseYocto(overview?.claimable);

    setClaiming(true);
    setToast({ type: 'pending', message: 'Collecting SOCIAL…' });

    try {
      const response = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });

      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        claimed?: string;
        error?: string;
        tx_hash?: string | null;
      } | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? 'Claim failed');
      }

      const claimed = parseYocto(data.claimed);
      if (claimed <= 0n) {
        setToast({ type: 'error', message: 'Nothing to claim yet.' });
        return;
      }

      setClaiming(false);
      setClaimBarHoldYocto(claimableSnapshot);
      setToast({
        type: 'success',
        message: `SOCIAL collected.`,
        explorerHref: nearblocksTxHref(data.tx_hash),
      });
      await refreshRewardsWithRetry({ silent: true });
      setClaimBarHoldYocto(null);
    } catch (error) {
      setClaimBarHoldYocto(null);
      setToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not collect SOCIAL.',
      });
    } finally {
      setClaiming(false);
    }
  }, [accountId, claiming, overview?.claimable, refreshRewardsWithRetry]);

  const chainClaimableYocto = useMemo(
    () => parseYocto(overview?.claimable),
    [overview?.claimable]
  );

  const claimableYocto = claimBarHoldYocto ?? chainClaimableYocto;

  const canClaim =
    claimBarHoldYocto == null &&
    chainClaimableYocto >= APP_REWARD_MIN_CLAIM_YOCTO &&
    !claiming;

  const remainingToClaimYocto = canClaim
    ? 0n
    : APP_REWARD_MIN_CLAIM_YOCTO > claimableYocto
      ? APP_REWARD_MIN_CLAIM_YOCTO - claimableYocto
      : 0n;

  const value = useMemo<AppRewardsContextValue>(
    () => ({
      claimableYocto,
      canClaim,
      claiming,
      remainingToClaimYocto,
      loading,
      refreshRewards,
      claimRewards,
    }),
    [
      canClaim,
      claimableYocto,
      claiming,
      claimRewards,
      loading,
      refreshRewards,
      remainingToClaimYocto,
    ]
  );

  return (
    <AppRewardsContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          className={`app-reward-toast is-${toast.type}`}
          role="status"
          aria-live="polite"
        >
          <p className="app-reward-toast-message">{toast.message}</p>
          {toast.explorerHref ? (
            <a
              className="app-reward-toast-link"
              href={toast.explorerHref}
              target="_blank"
              rel="noreferrer"
            >
              View on Nearblocks
            </a>
          ) : null}
        </div>
      ) : null}
    </AppRewardsContext.Provider>
  );
}

/** Optional hook for surfaces outside the provider (e.g. account sheet when closed). */
export function useAppRewardsOptional() {
  return useContext(AppRewardsContext);
}
