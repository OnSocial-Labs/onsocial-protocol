'use client';

import { useEffect, useState } from 'react';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';

export interface SharedStoragePoolSummary {
  poolId: string;
  storageBalanceYocto: bigint;
  usedBytes: number;
  sharedBytes: number;
  availableBytes: number;
  totalCapacityBytes: number;
}

interface SharedStoragePoolState {
  loading: boolean;
  error: string | null;
  summary: SharedStoragePoolSummary | null;
}

const initialState: SharedStoragePoolState = {
  loading: false,
  error: null,
  summary: null,
};

function parseSharedStoragePoolSummary(
  poolId: string,
  raw: Record<string, unknown> | null
): SharedStoragePoolSummary | null {
  if (!raw) return null;

  const storageBalance = raw.storage_balance;
  if (
    typeof storageBalance !== 'string' &&
    typeof storageBalance !== 'number'
  ) {
    return null;
  }

  return {
    poolId,
    storageBalanceYocto: BigInt(String(storageBalance)),
    usedBytes: Number(raw.used_bytes ?? 0),
    sharedBytes: Number(raw.shared_bytes ?? 0),
    availableBytes: Number(raw.available_bytes ?? 0),
    totalCapacityBytes: Number(raw.total_capacity_bytes ?? 0),
  };
}

export function useSharedStoragePool(
  poolAccountId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0
): SharedStoragePoolState {
  const activePoolId = enabled && poolAccountId ? poolAccountId : null;
  const [state, setState] = useState<SharedStoragePoolState>(initialState);
  const [loadedPoolId, setLoadedPoolId] = useState<string | null>(null);

  useEffect(() => {
    if (!activePoolId) return;

    let cancelled = false;
    const os = createPortalOnSocialClient();

    void (async () => {
      try {
        const raw = await os.storageAccount.sharedPool(activePoolId);
        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          summary: parseSharedStoragePoolSummary(
            activePoolId,
            raw as Record<string, unknown> | null
          ),
        });
        setLoadedPoolId(activePoolId);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load share pool',
          summary: null,
        });
        setLoadedPoolId(activePoolId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePoolId, refreshKey]);

  if (!activePoolId) {
    return initialState;
  }

  if (loadedPoolId !== activePoolId && !state.error) {
    return { ...initialState, loading: true };
  }

  return state;
}
