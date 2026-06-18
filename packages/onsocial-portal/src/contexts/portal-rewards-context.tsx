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
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { useProfile } from '@/contexts/profile-context';
import { useWallet } from '@/contexts/wallet-context';
import { formatSocialCompact } from '@/lib/leaderboard';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import {
  PORTAL_REWARD_AGGREGATE_MS,
  PORTAL_REWARD_MIN_CLAIM_YOCTO,
  PORTAL_REWARD_REFRESH_DELAYS_MS,
  compressPortalRewardToastReasons,
} from '@/lib/portal-reward-constants';
import { onPortalRewardCredited } from '@/lib/portal-reward-events';
import type { PortalRewardCreditEvent } from '@/lib/portal-reward-events';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import type { RewardsUserRewardsOverviewView } from '@/lib/near-rpc';

interface RefreshBalanceOptions {
  /** When true, keep showing the current balance instead of a loading placeholder. */
  silent?: boolean;
  /** When true, bypass the server cache (e.g. after a credit lands on-chain). */
  fresh?: boolean;
}

interface PortalRewardsContextValue {
  claimableYocto: bigint;
  totalEarnedYocto: bigint;
  /** Portal app daily progress (portal credits do not bump global_daily_earned). */
  portalDailyEarnedYocto: bigint;
  portalDailyCapYocto: bigint;
  globalDailyEarnedYocto: bigint;
  globalDailyRemainingYocto: bigint;
  canClaim: boolean;
  remainingToClaimYocto: bigint;
  loading: boolean;
  claiming: boolean;
  refreshBalance: (options?: RefreshBalanceOptions) => Promise<void>;
  refreshBalanceWithRetry: (options?: RefreshBalanceOptions) => Promise<void>;
  claimRewards: () => Promise<void>;
}

const PortalRewardsContext = createContext<PortalRewardsContextValue | null>(
  null
);

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

export function PortalRewardsProvider({ children }: { children: ReactNode }) {
  const { accountId } = useWallet();
  const { isUpdatingStanding } = useProfile();
  const [overview, setOverview] =
    useState<RewardsUserRewardsOverviewView | null>(null);
  const [pendingCreditYocto, setPendingCreditYocto] = useState(0n);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [toast, setToast] = useState<TransactionFeedback | null>(null);
  const aggregateRef = useRef<{
    total: bigint;
    events: PortalRewardCreditEvent[];
    timer: ReturnType<typeof setTimeout> | null;
  }>({ total: 0n, events: [], timer: null });
  const refreshGenerationRef = useRef(0);
  const chainClaimableRef = useRef(0n);
  const wasUpdatingStandingRef = useRef(false);

  const reconcilePendingCredit = useCallback((claimable: bigint) => {
    const delta = claimable - chainClaimableRef.current;
    chainClaimableRef.current = claimable;
    if (delta <= 0n) return;
    setPendingCreditYocto((pending) => {
      if (pending <= 0n) return 0n;
      return pending > delta ? pending - delta : 0n;
    });
  }, []);

  const fetchOverview = useCallback(
    async (
      options: Pick<RefreshBalanceOptions, 'fresh'> = {}
    ): Promise<bigint> => {
      if (!accountId) {
        setOverview(null);
        chainClaimableRef.current = 0n;
        return 0n;
      }

      const search = new URLSearchParams({ accountId });
      if (options.fresh) search.set('fresh', '1');

      const response = await fetch(
        `/api/rewards/overview?${search.toString()}`,
        {
          cache: 'no-store',
        }
      );
      const body = (await response.json().catch(() => null)) as {
        overview?: RewardsUserRewardsOverviewView | null;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.detail ??
            body?.error ??
            `Rewards overview failed (${response.status})`
        );
      }

      const nextOverview = body?.overview ?? null;
      setOverview(nextOverview);
      const claimable = parseYocto(nextOverview?.claimable);
      reconcilePendingCredit(claimable);
      return claimable;
    },
    [accountId, reconcilePendingCredit]
  );

  const refreshBalance = useCallback(
    async (options: RefreshBalanceOptions = {}) => {
      if (!accountId) {
        setOverview(null);
        setPendingCreditYocto(0n);
        return;
      }

      if (!options.silent) {
        setLoading(true);
      }

      try {
        await fetchOverview({ fresh: options.fresh });
      } catch {
        setOverview(null);
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [accountId, fetchOverview]
  );

  const refreshBalanceWithRetry = useCallback(
    async (options: RefreshBalanceOptions = {}) => {
      const generation = refreshGenerationRef.current + 1;
      refreshGenerationRef.current = generation;

      if (!options.silent) {
        setLoading(true);
      }

      for (const delayMs of PORTAL_REWARD_REFRESH_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (refreshGenerationRef.current !== generation) {
          return;
        }

        try {
          await fetchOverview({ fresh: options.fresh ?? true });
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
    [fetchOverview]
  );

  const flushAggregatedRewardToast = useCallback(() => {
    if (aggregateRef.current.timer) {
      clearTimeout(aggregateRef.current.timer);
      aggregateRef.current.timer = null;
    }

    const total = aggregateRef.current.total;
    const events = aggregateRef.current.events;
    aggregateRef.current.total = 0n;
    aggregateRef.current.events = [];

    if (total <= 0n) return;

    const reasons = compressPortalRewardToastReasons(events);
    setToast({
      type: 'success',
      msg: `+${formatSocialCompact(total.toString())} SOCIAL`,
      subtitle: reasons.length > 0 ? reasons.join(' · ') : undefined,
    });
    void refreshBalanceWithRetry({ silent: true });
  }, [refreshBalanceWithRetry]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    setPendingCreditYocto(0n);
    chainClaimableRef.current = 0n;
  }, [accountId]);

  useEffect(() => {
    return onPortalRewardCredited((event) => {
      try {
        const amount = BigInt(event.amountYocto);
        aggregateRef.current.total += amount;
        aggregateRef.current.events.push(event);
        setPendingCreditYocto((pending) => pending + amount);
      } catch {
        return;
      }

      if (aggregateRef.current.timer) {
        clearTimeout(aggregateRef.current.timer);
      }

      aggregateRef.current.timer = setTimeout(() => {
        flushAggregatedRewardToast();
      }, PORTAL_REWARD_AGGREGATE_MS);
    });
  }, [flushAggregatedRewardToast]);

  useEffect(() => {
    if (wasUpdatingStandingRef.current && !isUpdatingStanding) {
      flushAggregatedRewardToast();
    }
    wasUpdatingStandingRef.current = isUpdatingStanding;
  }, [flushAggregatedRewardToast, isUpdatingStanding]);

  useEffect(() => {
    const aggregate = aggregateRef.current;
    return () => {
      if (aggregate.timer) {
        clearTimeout(aggregate.timer);
      }
    };
  }, []);

  const claimRewards = useCallback(async () => {
    if (!accountId || claiming) return;

    setClaiming(true);
    setToast({
      type: 'pending',
      pendingPhase: 'chain',
      msg: txToastPending.claimingRewards,
    });

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
        setToast({
          type: 'error',
          msg: 'Nothing to claim yet.',
        });
        return;
      }

      setPendingCreditYocto(0n);
      setToast({
        type: 'success',
        msg: txToastSuccess.rewardsCollected(
          formatSocialCompact(claimed.toString())
        ),
        explorerHref: nearblocksTxHref(data.tx_hash),
      });
      await refreshBalanceWithRetry({ silent: true });
    } catch (error) {
      setToast({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.claimRewardsFailed,
      });
    } finally {
      setClaiming(false);
    }
  }, [accountId, claiming, refreshBalanceWithRetry]);

  const chainClaimableYocto = useMemo(
    () => parseYocto(overview?.claimable),
    [overview?.claimable]
  );

  const claimableYocto = useMemo(
    () => chainClaimableYocto + pendingCreditYocto,
    [chainClaimableYocto, pendingCreditYocto]
  );

  const totalEarnedYocto = useMemo(
    () => parseYocto(overview?.total_earned),
    [overview?.total_earned]
  );

  const globalDailyEarnedYocto = useMemo(
    () => parseYocto(overview?.global_daily_earned),
    [overview?.global_daily_earned]
  );

  const globalDailyRemainingYocto = useMemo(
    () => parseYocto(overview?.global_daily_remaining),
    [overview?.global_daily_remaining]
  );

  const portalDailyEarnedYocto = useMemo(
    () => parseYocto(overview?.app?.daily_earned),
    [overview?.app?.daily_earned]
  );

  const portalDailyCapYocto = useMemo(() => {
    const earned = parseYocto(overview?.app?.daily_earned);
    const remaining = parseYocto(overview?.app?.daily_remaining);
    return earned + remaining;
  }, [overview?.app?.daily_earned, overview?.app?.daily_remaining]);

  const canClaim = claimableYocto >= PORTAL_REWARD_MIN_CLAIM_YOCTO;
  const remainingToClaimYocto = canClaim
    ? 0n
    : PORTAL_REWARD_MIN_CLAIM_YOCTO > claimableYocto
      ? PORTAL_REWARD_MIN_CLAIM_YOCTO - claimableYocto
      : 0n;

  const value = useMemo<PortalRewardsContextValue>(
    () => ({
      claimableYocto,
      totalEarnedYocto,
      portalDailyEarnedYocto,
      portalDailyCapYocto,
      globalDailyEarnedYocto,
      globalDailyRemainingYocto,
      canClaim,
      remainingToClaimYocto,
      loading,
      claiming,
      refreshBalance,
      refreshBalanceWithRetry,
      claimRewards,
    }),
    [
      canClaim,
      claimableYocto,
      claiming,
      claimRewards,
      globalDailyEarnedYocto,
      globalDailyRemainingYocto,
      loading,
      portalDailyCapYocto,
      portalDailyEarnedYocto,
      refreshBalance,
      refreshBalanceWithRetry,
      remainingToClaimYocto,
      totalEarnedYocto,
    ]
  );

  return (
    <PortalRewardsContext.Provider value={value}>
      {children}
      <TransactionFeedbackToast result={toast} onClose={() => setToast(null)} />
    </PortalRewardsContext.Provider>
  );
}

export function usePortalRewards(): PortalRewardsContextValue {
  const context = useContext(PortalRewardsContext);
  if (!context) {
    throw new Error(
      'usePortalRewards must be used within PortalRewardsProvider'
    );
  }
  return context;
}

export function usePortalRewardsOptional(): PortalRewardsContextValue | null {
  return useContext(PortalRewardsContext);
}
