'use client';

import { useEffect, useState } from 'react';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import type { SharedStoragePoolSummary } from '@/hooks/use-shared-storage-pool';

interface GroupStoragePoolState {
  loading: boolean;
  error: string | null;
  summary: SharedStoragePoolSummary | null;
}

const initialState: GroupStoragePoolState = {
  loading: false,
  error: null,
  summary: null,
};

function parseGroupStoragePoolSummary(
  groupId: string,
  raw: Record<string, unknown> | null
): SharedStoragePoolSummary | null {
  if (!raw) {
    return {
      poolId: groupId,
      storageBalanceYocto: 0n,
      usedBytes: 0,
      sharedBytes: 0,
      availableBytes: 0,
      totalCapacityBytes: 0,
    };
  }

  const storageBalance = raw.storage_balance;
  if (
    typeof storageBalance !== 'string' &&
    typeof storageBalance !== 'number'
  ) {
    return {
      poolId: groupId,
      storageBalanceYocto: 0n,
      usedBytes: 0,
      sharedBytes: 0,
      availableBytes: 0,
      totalCapacityBytes: 0,
    };
  }

  return {
    poolId: groupId,
    storageBalanceYocto: BigInt(String(storageBalance)),
    usedBytes: Number(raw.used_bytes ?? 0),
    sharedBytes: Number(raw.shared_bytes ?? 0),
    availableBytes: Number(raw.available_bytes ?? 0),
    totalCapacityBytes: Number(raw.total_capacity_bytes ?? 0),
  };
}

export function useGroupStoragePool(
  groupId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0
): GroupStoragePoolState {
  const activeGroupId = enabled && groupId ? groupId : null;
  const [state, setState] = useState<GroupStoragePoolState>(initialState);
  const [loadedGroupId, setLoadedGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroupId) return;

    let cancelled = false;
    const os = createAppOnSocialClient(activeGroupId);

    void (async () => {
      try {
        const raw = await os.storageAccount.groupPool(activeGroupId);
        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          summary: parseGroupStoragePoolSummary(
            activeGroupId,
            raw as Record<string, unknown> | null
          ),
        });
        setLoadedGroupId(activeGroupId);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load group storage',
          summary: null,
        });
        setLoadedGroupId(activeGroupId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGroupId, refreshKey]);

  if (!activeGroupId) {
    return initialState;
  }

  if (loadedGroupId !== activeGroupId && !state.error) {
    return { ...initialState, loading: true };
  }

  return state;
}
