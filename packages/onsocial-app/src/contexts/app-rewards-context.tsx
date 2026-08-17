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
import type { PlatformRewardCreditEvent } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  APP_REWARD_MIN_CLAIM_YOCTO,
  APP_REWARD_REFRESH_DELAYS_MS,
} from '@/lib/app-reward-constants';
import {
  APP_REWARD_BURST_AGGREGATE_MS,
  buildBurstFlushSignature,
  resolveBurstAggregateDelayMs,
} from '@/lib/app-reward-burst-copy';
import { onAppRewardCredited } from '@/lib/app-reward-events';
import {
  APP_REWARD_TOAST_HOLD_MS,
  buildAppRewardCollectToast,
  buildAppRewardCreditToast,
} from '@/lib/app-rewards-toast';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import {
  txToastConfirming,
  txToastError,
} from '@/lib/transaction-toast-copy';

interface RewardsOverview {
  claimable: string;
  total_earned: string;
  total_claimed: string;
}

interface RefreshRewardsOptions {
  silent?: boolean;
  fresh?: boolean;
}

/** Collect button — dots while pending; success is the global toast. */
export type AppCollectPhase = 'idle' | 'pending';

interface AppRewardsContextValue {
  claimableYocto: bigint;
  canClaim: boolean;
  collectPhase: AppCollectPhase;
  /** True while claim is in flight (button pulsing dots). */
  claiming: boolean;
  remainingToClaimYocto: bigint;
  loading: boolean;
  /** Bumps when passive credits land — drives activity bar pulse. */
  activityBarPulseKey: number;
  refreshRewards: (options?: RefreshRewardsOptions) => Promise<void>;
  claimRewards: () => Promise<void>;
}

const AppRewardsContext = createContext<AppRewardsContextValue | null>(null);

function parseYocto(value: string | undefined): bigint {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
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
  const { open: accountSheetOpen } = useAppAccountSheet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [collectPhase, setCollectPhase] = useState<AppCollectPhase>('idle');
  const [activityBarPulseKey, setActivityBarPulseKey] = useState(0);
  const refreshGenerationRef = useRef(0);
  const chainClaimableRef = useRef(0n);
  const [pendingCreditYocto, setPendingCreditYocto] = useState(0n);
  const aggregateRef = useRef<{
    total: bigint;
    events: PlatformRewardCreditEvent[];
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    total: 0n,
    events: [],
    timer: null,
  });
  const toastActiveRef = useRef(false);
  const toastHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountSheetOpenRef = useRef(accountSheetOpen);
  const lastCelebratedSignatureRef = useRef<string | null>(null);
  const flushAggregatedCreditBurstRef = useRef<() => void>(() => {});
  const scheduleAggregatedBurstFlushRef = useRef<() => void>(() => {});

  useEffect(() => {
    accountSheetOpenRef.current = accountSheetOpen;
  }, [accountSheetOpen]);

  const fetchRewards = useCallback(
    async (
      options: Pick<RefreshRewardsOptions, 'fresh'> = {}
    ): Promise<void> => {
      if (!accountId) {
        setOverview(null);
        return;
      }

      const freshQuery = options.fresh ? '&fresh=1' : '';
      const response = await fetch(
        `/api/rewards/overview?accountId=${encodeURIComponent(accountId)}${freshQuery}`,
        { cache: 'no-store' }
      );
      const body = (await response.json().catch(() => null)) as {
        overview?: RewardsOverview | null;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.detail ??
            body?.error ??
            `Rewards lookup failed (${response.status})`
        );
      }

      setOverview(body?.overview ?? null);
    },
    [accountId]
  );

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
        await fetchRewards({ fresh: options.fresh });
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
          await fetchRewards({ fresh: options.fresh });
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
    setCollectPhase('idle');
    setPendingCreditYocto(0n);
    chainClaimableRef.current = 0n;
    toastActiveRef.current = false;
    if (toastHoldTimerRef.current) {
      clearTimeout(toastHoldTimerRef.current);
      toastHoldTimerRef.current = null;
    }
    lastCelebratedSignatureRef.current = null;
    aggregateRef.current = { total: 0n, events: [], timer: null };
  }, [accountId]);

  useEffect(() => {
    const chain = parseYocto(overview?.claimable);
    const previous = chainClaimableRef.current;
    if (chain > previous) {
      const increase = chain - previous;
      setPendingCreditYocto((pending) =>
        pending > increase ? pending - increase : 0n
      );
    }
    chainClaimableRef.current = chain;
  }, [overview?.claimable]);

  const armRewardToastHold = useCallback(() => {
    toastActiveRef.current = true;
    if (toastHoldTimerRef.current) {
      clearTimeout(toastHoldTimerRef.current);
    }
    toastHoldTimerRef.current = setTimeout(() => {
      toastHoldTimerRef.current = null;
      toastActiveRef.current = false;
      if (
        aggregateRef.current.total > 0n &&
        aggregateRef.current.events.length > 0
      ) {
        scheduleAggregatedBurstFlushRef.current();
      }
    }, APP_REWARD_TOAST_HOLD_MS);
  }, []);

  const showCreditToast = useCallback(
    (events: PlatformRewardCreditEvent[]) => {
      const toast = buildAppRewardCreditToast(events);
      if (!toast) return;
      armRewardToastHold();
      setTxResult(toast);
    },
    [armRewardToastHold, setTxResult]
  );

  const applyCreditBurst = useCallback(
    (
      total: bigint,
      events: PlatformRewardCreditEvent[],
      options: { refreshOverview?: boolean } = {}
    ) => {
      if (total <= 0n || events.length === 0) {
        return;
      }

      setPendingCreditYocto((pending) => pending + total);
      setActivityBarPulseKey((key) => key + 1);

      if (!accountSheetOpenRef.current) {
        showCreditToast(events);
      }

      if (options.refreshOverview !== false) {
        void refreshRewardsWithRetry({ silent: true, fresh: true });
      }
    },
    [refreshRewardsWithRetry, showCreditToast]
  );

  const flushAggregatedCreditBurst = useCallback(() => {
    if (aggregateRef.current.timer) {
      clearTimeout(aggregateRef.current.timer);
      aggregateRef.current.timer = null;
    }

    const total = aggregateRef.current.total;
    const events = aggregateRef.current.events;
    if (total <= 0n || events.length === 0) {
      return;
    }

    const signature = buildBurstFlushSignature(events);
    if (signature === lastCelebratedSignatureRef.current) {
      aggregateRef.current.total = 0n;
      aggregateRef.current.events = [];
      return;
    }

    if (toastActiveRef.current && !accountSheetOpenRef.current) {
      aggregateRef.current.timer = setTimeout(() => {
        flushAggregatedCreditBurstRef.current();
      }, APP_REWARD_BURST_AGGREGATE_MS);
      return;
    }

    lastCelebratedSignatureRef.current = signature;
    aggregateRef.current.total = 0n;
    aggregateRef.current.events = [];

    applyCreditBurst(total, events);
  }, [applyCreditBurst]);

  flushAggregatedCreditBurstRef.current = flushAggregatedCreditBurst;

  const scheduleAggregatedBurstFlush = useCallback(() => {
    if (aggregateRef.current.timer) {
      clearTimeout(aggregateRef.current.timer);
    }

    aggregateRef.current.timer = setTimeout(() => {
      flushAggregatedCreditBurstRef.current();
    }, resolveBurstAggregateDelayMs(aggregateRef.current.events));
  }, []);

  scheduleAggregatedBurstFlushRef.current = scheduleAggregatedBurstFlush;

  useEffect(() => {
    return onAppRewardCredited((event) => {
      let amount = 0n;
      try {
        amount = BigInt(event.amountYocto);
      } catch {
        return;
      }

      aggregateRef.current.total += amount;
      aggregateRef.current.events.push(event);
      scheduleAggregatedBurstFlush();
    });
  }, [scheduleAggregatedBurstFlush]);

  useEffect(() => {
    const aggregate = aggregateRef.current;
    return () => {
      if (aggregate.timer) {
        clearTimeout(aggregate.timer);
      }
      if (toastHoldTimerRef.current) {
        clearTimeout(toastHoldTimerRef.current);
      }
    };
  }, []);

  const claimRewards = useCallback(async () => {
    if (!accountId || collectPhase !== 'idle') {
      return;
    }

    const chainClaimableYocto = parseYocto(overview?.claimable);
    const displayClaimableYocto = chainClaimableYocto + pendingCreditYocto;
    if (displayClaimableYocto < APP_REWARD_MIN_CLAIM_YOCTO) {
      return;
    }

    setCollectPhase('pending');

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
        setCollectPhase('idle');
        return;
      }

      const txHash = typeof data.tx_hash === 'string' ? data.tx_hash.trim() : '';
      const collectToast = buildAppRewardCollectToast(claimed, txHash || null);
      if (!collectToast) {
        setCollectPhase('idle');
        return;
      }

      if (txHash) {
        const confirmed = await trackTransaction({
          txHashes: [txHash],
          submittedMessage: txToastConfirming.collectingSocial,
          successMessage: collectToast.msg,
          failureMessage: txToastError.collectSocialFailed,
        });
        setCollectPhase('idle');
        if (!confirmed) {
          return;
        }
        // trackTransaction already set success; hold the gate so a credit
        // flush cannot replace "X SOCIAL collected." mid-display.
        armRewardToastHold();
      } else {
        setCollectPhase('idle');
        armRewardToastHold();
        setTxResult(collectToast);
      }

      void refreshRewardsWithRetry({ silent: true, fresh: true });
      await refreshAppSocialBalanceAfterClaim();
    } catch {
      setCollectPhase('idle');
      setTxResult({
        type: 'error',
        msg: txToastError.collectSocialFailed,
      });
    }
  }, [
    accountId,
    armRewardToastHold,
    collectPhase,
    overview?.claimable,
    pendingCreditYocto,
    refreshRewardsWithRetry,
    setTxResult,
    trackTransaction,
  ]);

  const chainClaimableYocto = useMemo(
    () => parseYocto(overview?.claimable),
    [overview?.claimable]
  );

  const claimableYocto = chainClaimableYocto + pendingCreditYocto;

  const claiming = collectPhase === 'pending';

  const canClaim =
    collectPhase === 'idle' && claimableYocto >= APP_REWARD_MIN_CLAIM_YOCTO;

  const remainingToClaimYocto = canClaim
    ? 0n
    : APP_REWARD_MIN_CLAIM_YOCTO > claimableYocto
      ? APP_REWARD_MIN_CLAIM_YOCTO - claimableYocto
      : 0n;

  const value = useMemo<AppRewardsContextValue>(
    () => ({
      claimableYocto,
      canClaim,
      collectPhase,
      claiming,
      remainingToClaimYocto,
      loading,
      activityBarPulseKey,
      refreshRewards,
      claimRewards,
    }),
    [
      activityBarPulseKey,
      canClaim,
      claimableYocto,
      claimRewards,
      collectPhase,
      claiming,
      loading,
      refreshRewards,
      remainingToClaimYocto,
    ]
  );

  return (
    <AppRewardsContext.Provider value={value}>
      {children}
    </AppRewardsContext.Provider>
  );
}

/** Optional hook for surfaces outside the provider (e.g. account sheet when closed). */
export function useAppRewardsOptional() {
  return useContext(AppRewardsContext);
}
