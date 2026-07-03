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
import type { PlatformRewardCreditEvent } from '@onsocial/sdk';
import {
  APP_REWARD_MIN_CLAIM_YOCTO,
  APP_REWARD_REFRESH_DELAYS_MS,
} from '@/lib/app-reward-constants';
import {
  APP_REWARD_BURST_AGGREGATE_MS,
  compressAppRewardBurstReasons,
  buildBurstFlushSignature,
  resolveBurstAggregateDelayMs,
  resolveBurstDisplayAmount,
  shouldShowBurstCelebration,
} from '@/lib/app-reward-burst-copy';
import { waitForNearTransactionBatchConfirmation } from '@/lib/app-near-rpc';
import { onAppRewardCredited } from '@/lib/app-reward-events';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import { AppRewardCreditBurst } from '@/components/wallet/app-reward-credit-burst';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';

interface RewardsOverview {
  claimable: string;
  total_earned: string;
  total_claimed: string;
}

interface RefreshRewardsOptions {
  silent?: boolean;
  fresh?: boolean;
}

/** Inline collect feedback — pulsing dots while pending, green chip on success. No toast. */
export type AppCollectPhase = 'idle' | 'pending' | 'succeeded';

export interface AppRewardCreditBurstState {
  id: number;
  amountYocto: bigint;
  reasons: string[];
}

interface AppRewardsContextValue {
  claimableYocto: bigint;
  canClaim: boolean;
  collectPhase: AppCollectPhase;
  /** True while claim is in flight (button pulsing dots). */
  claiming: boolean;
  collectSucceeded: boolean;
  remainingToClaimYocto: bigint;
  loading: boolean;
  /** Bumps when passive credits land — drives activity bar pulse. */
  activityBarPulseKey: number;
  creditBurst: AppRewardCreditBurstState | null;
  dismissCreditBurst: () => void;
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
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [collectPhase, setCollectPhase] = useState<AppCollectPhase>('idle');
  const [activityBarPulseKey, setActivityBarPulseKey] = useState(0);
  const [creditBurst, setCreditBurst] = useState<AppRewardCreditBurstState | null>(
    null
  );
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
  const activeBurstEventsRef = useRef<PlatformRewardCreditEvent[]>([]);
  const creditBurstRef = useRef<AppRewardCreditBurstState | null>(null);
  const burstActiveRef = useRef(false);
  const accountSheetOpenRef = useRef(accountSheetOpen);
  const lastCelebratedSignatureRef = useRef<string | null>(null);
  const burstSessionIdRef = useRef(0);
  const flushAggregatedCreditBurstRef = useRef<() => void>(() => {});
  const scheduleAggregatedBurstFlushRef = useRef<() => void>(() => {});

  useEffect(() => {
    creditBurstRef.current = creditBurst;
    burstActiveRef.current = creditBurst !== null;
  }, [creditBurst]);

  useEffect(() => {
    accountSheetOpenRef.current = accountSheetOpen;
  }, [accountSheetOpen]);

  const fetchRewards = useCallback(
    async (options: Pick<RefreshRewardsOptions, 'fresh'> = {}): Promise<void> => {
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
        body?.detail ?? body?.error ?? `Rewards lookup failed (${response.status})`
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
    setCreditBurst(null);
    setPendingCreditYocto(0n);
    chainClaimableRef.current = 0n;
    activeBurstEventsRef.current = [];
    creditBurstRef.current = null;
    burstActiveRef.current = false;
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

  const dismissCreditBurst = useCallback(() => {
    activeBurstEventsRef.current = [];
    creditBurstRef.current = null;
    burstActiveRef.current = false;
    lastCelebratedSignatureRef.current = null;
    setCreditBurst(null);

    if (aggregateRef.current.total > 0n && aggregateRef.current.events.length > 0) {
      scheduleAggregatedBurstFlushRef.current();
    }
  }, []);

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

      if (!accountSheetOpenRef.current && shouldShowBurstCelebration(events)) {
        const displayTotal = resolveBurstDisplayAmount(events);
        if (displayTotal <= 0n) {
          if (options.refreshOverview !== false) {
            void refreshRewardsWithRetry({ silent: true, fresh: true });
          }
          return;
        }

        const reasons = compressAppRewardBurstReasons(events);
        const current = creditBurstRef.current;
        if (
          current &&
          current.amountYocto === displayTotal &&
          current.reasons.length === reasons.length &&
          current.reasons.every((reason, index) => reason === reasons[index])
        ) {
          if (options.refreshOverview !== false) {
            void refreshRewardsWithRetry({ silent: true, fresh: true });
          }
          return;
        }

        burstSessionIdRef.current += 1;
        const nextBurst: AppRewardCreditBurstState = {
          id: burstSessionIdRef.current,
          amountYocto: displayTotal,
          reasons,
        };

        activeBurstEventsRef.current = events;
        creditBurstRef.current = nextBurst;
        burstActiveRef.current = true;
        setCreditBurst(nextBurst);
      }

      if (options.refreshOverview !== false) {
        void refreshRewardsWithRetry({ silent: true, fresh: true });
      }
    },
    [refreshRewardsWithRetry]
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

    if (burstActiveRef.current && !accountSheetOpenRef.current) {
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
      if (txHash) {
        const confirmation = await waitForNearTransactionBatchConfirmation({
          txHashes: [txHash],
          accountId,
        });

        if (!confirmation.ok) {
          throw new Error(
            confirmation.errorMessage ?? 'Collection failed on-chain.'
          );
        }
      }

      setCollectPhase('succeeded');
    void refreshRewardsWithRetry({ silent: true, fresh: true });
      await refreshAppSocialBalanceAfterClaim();
      setCollectPhase('idle');
    } catch {
      setCollectPhase('idle');
    }
  }, [
    accountId,
    collectPhase,
    overview?.claimable,
    pendingCreditYocto,
    refreshRewardsWithRetry,
  ]);

  const chainClaimableYocto = useMemo(
    () => parseYocto(overview?.claimable),
    [overview?.claimable]
  );

  const claimableYocto = chainClaimableYocto + pendingCreditYocto;

  const claiming = collectPhase === 'pending';
  const collectSucceeded = collectPhase === 'succeeded';

  const canClaim =
    collectPhase === 'idle' &&
    claimableYocto >= APP_REWARD_MIN_CLAIM_YOCTO;

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
      collectSucceeded,
      remainingToClaimYocto,
      loading,
      activityBarPulseKey,
      creditBurst,
      dismissCreditBurst,
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
      collectSucceeded,
      creditBurst,
      dismissCreditBurst,
      loading,
      refreshRewards,
      remainingToClaimYocto,
    ]
  );

  return (
    <AppRewardsContext.Provider value={value}>
      {children}
      <AppRewardCreditBurst />
    </AppRewardsContext.Provider>
  );
}

/** Optional hook for surfaces outside the provider (e.g. account sheet when closed). */
export function useAppRewardsOptional() {
  return useContext(AppRewardsContext);
}
