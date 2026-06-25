'use client';

import { useEffect, useState } from 'react';
import type { ActiveStorageShareGrant } from '@/lib/user-storage-display';

interface StorageSharesGrantedState {
  loading: boolean;
  error: string | null;
  grants: ActiveStorageShareGrant[];
}

const initialState: StorageSharesGrantedState = {
  loading: false,
  error: null,
  grants: [],
};

interface SharesGrantedApiResponse {
  grants?: ActiveStorageShareGrant[];
  error?: string;
  detail?: string;
}

export function useStorageSharesGranted(
  poolOwnerId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0,
  includeTargetIds: string[] = []
): StorageSharesGrantedState {
  const activePoolOwnerId = enabled && poolOwnerId ? poolOwnerId : null;
  const includeTargetsKey = includeTargetIds.join(',');
  const [state, setState] = useState<StorageSharesGrantedState>(initialState);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!activePoolOwnerId) return;

    let cancelled = false;
    const requestKey = `${activePoolOwnerId}:${refreshKey}:${includeTargetsKey}`;

    void (async () => {
      try {
        const params = new URLSearchParams({
          poolOwnerId: activePoolOwnerId,
        });
        if (refreshKey > 0) {
          params.set('fresh', '1');
        }
        if (includeTargetIds.length > 0) {
          params.set('includeTargets', includeTargetIds.join(','));
        }

        const response = await fetch(
          `/api/storage/shares-granted?${params.toString()}`
        );
        const body = (await response.json()) as SharesGrantedApiResponse;

        if (cancelled) return;

        if (!response.ok) {
          setState({
            loading: false,
            error: body.error ?? body.detail ?? 'Could not load active shares',
            grants: [],
          });
          setLoadedKey(requestKey);
          return;
        }

        setState({
          loading: false,
          error: null,
          grants: body.grants ?? [],
        });
        setLoadedKey(requestKey);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load active shares',
          grants: [],
        });
        setLoadedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePoolOwnerId, refreshKey, includeTargetsKey]);

  if (!activePoolOwnerId) {
    return initialState;
  }

  const requestKey = `${activePoolOwnerId}:${refreshKey}:${includeTargetsKey}`;
  if (loadedKey !== requestKey && !state.error) {
    return { ...initialState, loading: true };
  }

  return state;
}
