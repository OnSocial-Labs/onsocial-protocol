'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoostContractStats } from '@onsocial/sdk';
import {
  fetchActiveBoosterCount,
  fetchBoostStats,
} from '@/features/boost/boost-position';

export interface BoostNetworkPulseState {
  stats: BoostContractStats | null;
  boosterCount: number | null;
  loaded: boolean;
  refresh: () => Promise<void>;
}

/**
 * Protocol Boost heartbeat — total locked, scheduled pool, weekly rate,
 * and indexed booster count. Fetch while the sheet is open.
 */
export function useBoostNetworkPulse(live: boolean): BoostNetworkPulseState {
  const [stats, setStats] = useState<BoostContractStats | null>(null);
  const [boosterCount, setBoosterCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      const [nextStats, nextCount] = await Promise.all([
        fetchBoostStats().catch(() => null),
        fetchActiveBoosterCount(),
      ]);
      if (seq !== requestSeqRef.current) return;
      setStats(nextStats);
      setBoosterCount(nextCount);
    } finally {
      if (seq === requestSeqRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    void refresh();
  }, [live, refresh]);

  return { stats, boosterCount, loaded, refresh };
}
