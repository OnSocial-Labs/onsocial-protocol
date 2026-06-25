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
  PORTAL_REWARD_COALESCE_MS,
  PORTAL_REWARD_MIN_CLAIM_YOCTO,
  PORTAL_REWARD_REFRESH_DELAYS_MS,
  emptyPortalRewardActionProgress,
  compressPortalRewardToastReasons,
  type PortalRewardActionProgress,
} from '@/lib/portal-reward-constants';
import {
  confirmPortalRewardActionCredit,
  reconcilePortalRewardActionProgress,
} from '@/lib/portal-reward-action-ledger';
import { onPortalRewardCredited } from '@/lib/portal-reward-events';
import type { PortalRewardCreditEvent } from '@/lib/portal-reward-events';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import type { RewardsUserRewardsOverviewView } from '@/lib/near-rpc';

interface RefreshRewardsStateOptions {
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
  actionProgress: PortalRewardActionProgress;
  canClaim: boolean;
  remainingToClaimYocto: bigint;
  loading: boolean;
  claiming: boolean;
  refreshRewardsState: (options?: RefreshRewardsStateOptions) => Promise<void>;
  refreshRewardsStateWithRetry: (
    options?: RefreshRewardsStateOptions
  ) => Promise<void>;
  /** @deprecated Use refreshRewardsState */
  refreshBalance: (options?: RefreshRewardsStateOptions) => Promise<void>;
  /** @deprecated Use refreshRewardsStateWithRetry */
  refreshBalanceWithRetry: (
    options?: RefreshRewardsStateOptions
  ) => Promise<void>;
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
  const [actionProgress, setActionProgress] =
    useState<PortalRewardActionProgress>(emptyPortalRewardActionProgress);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  /** Keeps claim bar filled until refresh settles after a successful claim. */
  const [claimBarHoldYocto, setClaimBarHoldYocto] = useState<bigint | null>(
    null
  );
  const [toast, setToast] = useState<TransactionFeedback | null>(null);
  const aggregateRef = useRef<{
    total: bigint;
    events: PortalRewardCreditEvent[];
    timer: ReturnType<typeof setTimeout> | null;
  }>({ total: 0n, events: [], timer: null });
  const actionLedgerRef = useRef<PortalRewardActionProgress>(
    emptyPortalRewardActionProgress()
  );
  const refreshGenerationRef = useRef(0);
  const wasUpdatingStandingRef = useRef(false);

  const fetchRewardsState = useCallback(
    async (
      options: Pick<RefreshRewardsStateOptions, 'fresh'> = {}
    ): Promise<void> => {
      if (!accountId) {
        setOverview(null);
        setActionProgress(emptyPortalRewardActionProgress());
        actionLedgerRef.current = emptyPortalRewardActionProgress();
        return;
      }

      const search = new URLSearchParams({ accountId });
      if (options.fresh) search.set('fresh', '1');

      const response = await fetch(
        `/api/rewards/overview?${search.toString()}`,
        { cache: 'no-store' }
      );
      const body = (await response.json().catch(() => null)) as {
        overview?: RewardsUserRewardsOverviewView | null;
        actions?: PortalRewardActionProgress | null;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.detail ??
            body?.error ??
            `Rewards state failed (${response.status})`
        );
      }

      setOverview(body?.overview ?? null);
      const apiActions = body?.actions ?? emptyPortalRewardActionProgress();
      const merged = reconcilePortalRewardActionProgress(
        actionLedgerRef.current,
        apiActions
      );
      actionLedgerRef.current = merged;
      setActionProgress(merged);
    },
    [accountId]
  );

  const refreshRewardsState = useCallback(
    async (options: RefreshRewardsStateOptions = {}) => {
      if (!accountId) {
        setOverview(null);
        setActionProgress(emptyPortalRewardActionProgress());
        actionLedgerRef.current = emptyPortalRewardActionProgress();
        return;
      }

      if (!options.silent) {
        setLoading(true);
      }

      try {
        await fetchRewardsState({ fresh: options.fresh });
      } catch {
        setOverview(null);
        setActionProgress(emptyPortalRewardActionProgress());
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [accountId, fetchRewardsState]
  );

  const refreshRewardsStateWithRetry = useCallback(
    async (options: RefreshRewardsStateOptions = {}) => {
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
          await fetchRewardsState({ fresh: options.fresh ?? true });
        } catch {
          if (!options.silent) {
            setOverview(null);
            setActionProgress(emptyPortalRewardActionProgress());
          }
        }
      }

      if (!options.silent) {
        setLoading(false);
      }
    },
    [fetchRewardsState]
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
    const txHash = [...events].reverse().find((event) => event.txHash)?.txHash;
    setToast({
      type: 'success',
      msg: `+${formatSocialCompact(total.toString())} SOCIAL`,
      subtitle: reasons.length > 0 ? reasons.join(' · ') : undefined,
      explorerHref: nearblocksTxHref(txHash),
    });
    void refreshRewardsStateWithRetry({ silent: true });
  }, [refreshRewardsStateWithRetry]);

  const scheduleAggregatedFlush = useCallback(() => {
    if (aggregateRef.current.timer) {
      clearTimeout(aggregateRef.current.timer);
    }

    const delay =
      aggregateRef.current.events.length === 1
        ? PORTAL_REWARD_COALESCE_MS
        : PORTAL_REWARD_AGGREGATE_MS;

    aggregateRef.current.timer = setTimeout(() => {
      flushAggregatedRewardToast();
    }, delay);
  }, [flushAggregatedRewardToast]);

  useEffect(() => {
    void refreshRewardsState();
  }, [refreshRewardsState]);

  useEffect(() => {
    actionLedgerRef.current = emptyPortalRewardActionProgress();
    setClaimBarHoldYocto(null);
  }, [accountId]);

  useEffect(() => {
    return onPortalRewardCredited((event) => {
      try {
        const amount = BigInt(event.amountYocto);
        aggregateRef.current.total += amount;
        aggregateRef.current.events.push(event);
      } catch {
        return;
      }

      if (event.actions) {
        const merged = reconcilePortalRewardActionProgress(
          actionLedgerRef.current,
          event.actions
        );
        actionLedgerRef.current = merged;
        setActionProgress(merged);
      } else {
        const next = confirmPortalRewardActionCredit(
          actionLedgerRef.current,
          event.action
        );
        actionLedgerRef.current = next;
        setActionProgress(next);
      }

      scheduleAggregatedFlush();
    });
  }, [scheduleAggregatedFlush]);

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

    const claimableSnapshot = parseYocto(overview?.claimable);

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

      setClaiming(false);
      setClaimBarHoldYocto(claimableSnapshot);
      setToast({
        type: 'success',
        msg: txToastSuccess.rewardsCollected(
          formatSocialCompact(claimed.toString())
        ),
        explorerHref: nearblocksTxHref(data.tx_hash),
      });
      await refreshRewardsStateWithRetry({ silent: true });
      setClaimBarHoldYocto(null);
    } catch (error) {
      setClaimBarHoldYocto(null);
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
  }, [accountId, claiming, overview?.claimable, refreshRewardsStateWithRetry]);

  const chainClaimableYocto = useMemo(
    () => parseYocto(overview?.claimable),
    [overview?.claimable]
  );

  const claimableYocto = claimBarHoldYocto ?? chainClaimableYocto;

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

  const canClaim =
    claimBarHoldYocto == null &&
    chainClaimableYocto >= PORTAL_REWARD_MIN_CLAIM_YOCTO &&
    !claiming;
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
      actionProgress,
      canClaim,
      remainingToClaimYocto,
      loading,
      claiming,
      refreshRewardsState,
      refreshRewardsStateWithRetry,
      refreshBalance: refreshRewardsState,
      refreshBalanceWithRetry: refreshRewardsStateWithRetry,
      claimRewards,
    }),
    [
      actionProgress,
      canClaim,
      claimableYocto,
      claiming,
      claimRewards,
      globalDailyEarnedYocto,
      globalDailyRemainingYocto,
      loading,
      portalDailyCapYocto,
      portalDailyEarnedYocto,
      refreshRewardsState,
      refreshRewardsStateWithRetry,
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
