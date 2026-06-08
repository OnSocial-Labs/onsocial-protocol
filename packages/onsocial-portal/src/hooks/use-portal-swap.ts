'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { executeRefSwapTransactions } from '@/lib/execute-ref-swap';
import { finalizeAmountInput } from '@/lib/amount-input';
import {
  PORTAL_SWAP_BALANCE_REFRESH_MS,
  PORTAL_SWAP_ENABLED,
  PORTAL_SWAP_QUOTE_REFRESH_MS,
  portalSwapAmountMaxDecimals,
  type PortalSwapInputKind,
} from '@/lib/portal-swap-config';
import {
  humanizeSwapTransactionError,
  type PortalSwapQuoteDetails,
} from '@/lib/portal-swap-quote';
import { evaluatePortalSwapValidation } from '@/lib/portal-swap-validation';
import type { RefSwapTransaction } from '@/lib/ref-swap-types';
import type { NearWalletBase } from '@hot-labs/near-connect';

type RunEstimateOptions = {
  silent?: boolean;
};

export function usePortalSwap(accountId: string | null) {
  const [tokenIn, setTokenIn] = useState<PortalSwapInputKind>('near');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [quote, setQuote] = useState<PortalSwapQuoteDetails | null>(null);
  const [inputBalance, setInputBalance] = useState<string | null>(null);
  const [nearBalance, setNearBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [socialBalance, setSocialBalance] = useState<string | null>(null);
  const [needsWnearStorage, setNeedsWnearStorage] = useState(false);
  const [loadingPools, setLoadingPools] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped after each successful quote to schedule the next silent refresh. */
  const [quoteSeq, setQuoteSeq] = useState(0);
  const estimateRequestRef = useRef(0);
  const balanceRequestRef = useRef(0);
  const userEstimateIdRef = useRef(0);
  const amountInRef = useRef(amountIn);
  const tokenInRef = useRef(tokenIn);
  const swappingRef = useRef(swapping);

  useEffect(() => {
    amountInRef.current = amountIn;
  }, [amountIn]);

  useEffect(() => {
    tokenInRef.current = tokenIn;
  }, [tokenIn]);

  useEffect(() => {
    swappingRef.current = swapping;
  }, [swapping]);

  useEffect(() => {
    setAmountIn((current) => {
      if (!current) return current;
      return finalizeAmountInput(current, portalSwapAmountMaxDecimals(tokenIn));
    });
  }, [tokenIn]);

  const applyInputBalanceForToken = useCallback(
    (kind: PortalSwapInputKind, near: string | null, usdc: string | null) => {
      setInputBalance(kind === 'near' ? near : usdc);
    },
    []
  );

  useEffect(() => {
    applyInputBalanceForToken(tokenIn, nearBalance, usdcBalance);
  }, [applyInputBalanceForToken, nearBalance, tokenIn, usdcBalance]);

  const refreshBalances = useCallback(async () => {
    if (!accountId || !PORTAL_SWAP_ENABLED) {
      setInputBalance(null);
      setNearBalance(null);
      setUsdcBalance(null);
      setSocialBalance(null);
      setNeedsWnearStorage(false);
      return;
    }

    const requestId = ++balanceRequestRef.current;
    const kind = tokenInRef.current;

    try {
      const response = await fetch(
        `/api/swap/balance?accountId=${encodeURIComponent(accountId)}&kind=${encodeURIComponent(kind)}`,
        { cache: 'no-store' }
      );
      const data = (await response.json()) as {
        success?: boolean;
        balanceYocto?: string;
        nearBalanceYocto?: string;
        usdcBalanceYocto?: string;
        socialBalanceYocto?: string;
        needsWnearStorage?: boolean;
        error?: string;
      };
      if (requestId !== balanceRequestRef.current) return;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Balance unavailable.');
      }

      const nextNear = data.nearBalanceYocto ?? '0';
      const nextUsdc = data.usdcBalanceYocto ?? '0';
      setNearBalance(nextNear);
      setUsdcBalance(nextUsdc);
      setSocialBalance(data.socialBalanceYocto ?? '0');
      setNeedsWnearStorage(Boolean(data.needsWnearStorage));
      applyInputBalanceForToken(tokenInRef.current, nextNear, nextUsdc);
    } catch {
      if (requestId !== balanceRequestRef.current) return;
      setInputBalance(null);
      setNearBalance(null);
      setUsdcBalance(null);
      setSocialBalance(null);
      setNeedsWnearStorage(false);
    }
  }, [accountId, applyInputBalanceForToken]);

  useEffect(() => {
    if (!PORTAL_SWAP_ENABLED) {
      setLoadingPools(false);
      return;
    }
    setLoadingPools(true);
    setError(null);
    setLoadingPools(false);
  }, [tokenIn]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    if (!accountId || !PORTAL_SWAP_ENABLED) return;

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void refreshBalances();
      }
    }, PORTAL_SWAP_BALANCE_REFRESH_MS);

    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshBalances();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [accountId, refreshBalances]);

  const runEstimateRef = useRef<
    (options?: RunEstimateOptions) => Promise<void>
  >(async () => {});

  const runEstimate = useCallback(async (options?: RunEstimateOptions) => {
    const silent = options?.silent ?? false;
    const requestId = ++estimateRequestRef.current;
    let userEstimateId: number | null = null;

    if (!PORTAL_SWAP_ENABLED) {
      setAmountOut('');
      setQuote(null);
      return;
    }

    const trimmed = amountInRef.current.trim();
    if (!trimmed || Number(trimmed) <= 0) {
      setAmountOut('');
      setQuote(null);
      return;
    }

    if (silent) {
      setRefreshingQuote(true);
    } else {
      userEstimateId = ++userEstimateIdRef.current;
      setEstimating(true);
      setError(null);
    }

    try {
      const response = await fetch('/api/swap/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          kind: tokenInRef.current,
          amountIn: trimmed,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        amountOut?: string;
        quote?: PortalSwapQuoteDetails;
        error?: string;
      };
      if (requestId !== estimateRequestRef.current) return;
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Could not estimate swap.');
      }
      setAmountOut(data.amountOut ?? '');
      setQuote(data.quote ?? null);
      if (!silent) {
        setError(null);
      }
      setQuoteSeq((value) => value + 1);
    } catch (err) {
      if (requestId !== estimateRequestRef.current) return;
      if (!silent) {
        setAmountOut('');
        setQuote(null);
        setError(
          humanizeSwapTransactionError(
            err instanceof Error ? err.message : 'Could not estimate swap.'
          )
        );
      } else {
        // Keep the chain alive even when a background refresh fails.
        setQuoteSeq((value) => value + 1);
      }
    } finally {
      if (silent) {
        if (requestId === estimateRequestRef.current) {
          setRefreshingQuote(false);
        }
      } else if (
        userEstimateId !== null &&
        userEstimateId === userEstimateIdRef.current
      ) {
        setEstimating(false);
      }
    }
  }, []);

  runEstimateRef.current = runEstimate;

  useEffect(() => {
    if (!PORTAL_SWAP_ENABLED) {
      setQuoteSeq(0);
      setAmountOut('');
      setQuote(null);
      return;
    }

    const trimmed = amountIn.trim();
    if (!trimmed || Number(trimmed) <= 0) {
      setQuoteSeq(0);
      estimateRequestRef.current += 1;
      userEstimateIdRef.current += 1;
      setAmountOut('');
      setQuote(null);
      setEstimating(false);
      setRefreshingQuote(false);
      return;
    }

    setQuoteSeq(0);
    estimateRequestRef.current += 1;
    userEstimateIdRef.current += 1;
    setEstimating(true);
    setRefreshingQuote(false);
    setAmountOut('');
    setQuote(null);
    setError(null);

    const timer = window.setTimeout(() => {
      void runEstimateRef.current({ silent: false });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [amountIn, tokenIn]);

  useEffect(() => {
    if (quoteSeq === 0 || swapping) return;

    const trimmed = amountIn.trim();
    if (!PORTAL_SWAP_ENABLED || !trimmed || Number(trimmed) <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (swappingRef.current) return;
      if (document.hidden) {
        setQuoteSeq((value) => value + 1);
        return;
      }
      void runEstimateRef.current({ silent: true });
    }, PORTAL_SWAP_QUOTE_REFRESH_MS);

    return () => window.clearTimeout(timer);
  }, [quoteSeq, amountIn, tokenIn, swapping]);

  const refreshQuote = useCallback(() => {
    setQuoteSeq(0);
    void runEstimateRef.current({ silent: false });
  }, []);

  const resetAfterSwap = useCallback(async () => {
    setQuoteSeq(0);
    estimateRequestRef.current += 1;
    userEstimateIdRef.current += 1;
    setEstimating(false);
    setRefreshingQuote(false);
    setAmountIn('');
    setAmountOut('');
    setQuote(null);
    setError(null);
    await refreshBalances();
  }, [refreshBalances]);

  const prepareSwapTransactions = useCallback(async (): Promise<
    RefSwapTransaction[]
  > => {
    const trimmed = finalizeAmountInput(
      amountIn,
      portalSwapAmountMaxDecimals(tokenIn)
    ).trim();
    if (!trimmed || Number(trimmed) <= 0) {
      throw new Error('Enter a valid amount.');
    }
    if (!accountId) {
      throw new Error('Connect wallet to continue.');
    }
    if (!PORTAL_SWAP_ENABLED) {
      throw new Error('Swap is only available on mainnet.');
    }

    setSwapping(true);
    setError(null);
    try {
      const response = await fetch('/api/swap/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          kind: tokenIn,
          amountIn: trimmed,
          accountId,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        transactions?: RefSwapTransaction[];
        error?: string;
      };
      if (!response.ok || !data.success || !data.transactions?.length) {
        throw new Error(data.error ?? 'Could not prepare swap.');
      }
      return data.transactions;
    } catch (err) {
      setSwapping(false);
      const message = humanizeSwapTransactionError(
        err instanceof Error ? err.message : 'Could not prepare swap.'
      );
      setError(message);
      throw new Error(message);
    }
  }, [accountId, amountIn, tokenIn]);

  const signPreparedSwap = useCallback(
    async (
      wallet: NearWalletBase,
      signerId: string,
      transactions: RefSwapTransaction[]
    ) => {
      setError(null);
      try {
        return await executeRefSwapTransactions(wallet, signerId, transactions);
      } catch (err) {
        const message = humanizeSwapTransactionError(
          err instanceof Error ? err.message : 'Swap transaction failed.'
        );
        setError(message);
        throw new Error(message);
      } finally {
        setSwapping(false);
      }
    },
    []
  );

  const validation = evaluatePortalSwapValidation({
    tokenIn,
    amountIn,
    inputBalanceYocto: inputBalance,
    nearBalanceYocto: nearBalance,
    needsWnearStorage,
    hasQuote: Boolean(amountOut) && !estimating && !refreshingQuote,
    estimating,
    refreshingQuote,
    swapping,
    accountId,
    enabled: PORTAL_SWAP_ENABLED && !loadingPools,
  });

  const setMaxAmount = useCallback(() => {
    if (!validation.maxAmount || validation.maxAmount === '0') return;
    setAmountIn(
      finalizeAmountInput(
        validation.maxAmount,
        portalSwapAmountMaxDecimals(tokenIn)
      )
    );
    setError(null);
  }, [tokenIn, validation.maxAmount]);

  return {
    tokenIn,
    setTokenIn,
    amountIn,
    setAmountIn,
    amountOut,
    quote,
    inputBalance,
    nearBalance,
    socialBalance,
    needsWnearStorage,
    loadingPools,
    estimating,
    refreshingQuote,
    swapping,
    error,
    setError,
    prepareSwapTransactions,
    signPreparedSwap,
    refreshBalances,
    refreshQuote,
    resetAfterSwap,
    setMaxAmount,
    swapHint: validation.hint,
    maxAmount: validation.maxAmount,
    canSwap: validation.canSwap,
  };
}
