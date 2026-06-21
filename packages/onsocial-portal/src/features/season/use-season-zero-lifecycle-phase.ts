'use client';

import { useEffect, useState } from 'react';
import {
  resolveSeasonZeroLifecyclePhase,
  type SeasonZeroLifecyclePhase,
  type SeasonZeroOnChainConfig,
  type SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';

/** Re-resolves rally phase on a clock tick so start/end transitions don't wait for refresh. */
export function useSeasonZeroLifecyclePhase(
  onChain: SeasonZeroOnChainConfig | null | undefined,
  settlement: SeasonZeroSettlementSummary | null | undefined
): SeasonZeroLifecyclePhase | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    onChain?.starts_at_ns,
    onChain?.ends_at_ns,
    onChain?.is_live,
    onChain?.claim_open,
    settlement?.status,
    settlement?.publishedTxHash,
  ]);

  if (!onChain) {
    return null;
  }

  return resolveSeasonZeroLifecyclePhase(onChain, settlement, nowMs);
}
