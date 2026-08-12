'use client';

import { useEffect, useState } from 'react';
import type { ActiveGroupSponsorDefault } from '@/lib/app-group-storage-grants';
import type { ActiveStorageShareGrant } from '@/lib/user-storage-display';

interface GroupStorageGrantsState {
  loading: boolean;
  error: string | null;
  grants: ActiveStorageShareGrant[];
  defaultQuota: ActiveGroupSponsorDefault | null;
}

const initialState: GroupStorageGrantsState = {
  loading: false,
  error: null,
  grants: [],
  defaultQuota: null,
};

interface GroupGrantsApiResponse {
  grants?: ActiveStorageShareGrant[];
  defaultQuota?: ActiveGroupSponsorDefault | null;
  error?: string;
  detail?: string;
}

export function useGroupStorageGrants(
  groupId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0,
  includeTargetIds: string[] = []
): GroupStorageGrantsState {
  const activeGroupId = enabled && groupId ? groupId : null;
  const includeTargetsKey = includeTargetIds.join(',');
  const [state, setState] = useState<GroupStorageGrantsState>(initialState);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroupId) return;

    let cancelled = false;
    const requestKey = `${activeGroupId}:${refreshKey}:${includeTargetsKey}`;

    void (async () => {
      try {
        const params = new URLSearchParams({ groupId: activeGroupId });
        if (refreshKey > 0) {
          params.set('fresh', '1');
        }
        if (includeTargetIds.length > 0) {
          params.set('includeTargets', includeTargetIds.join(','));
        }

        const response = await fetch(
          `/api/storage/group-grants?${params.toString()}`
        );
        const body = (await response.json()) as GroupGrantsApiResponse;

        if (cancelled) return;

        if (!response.ok) {
          setState({
            loading: false,
            error: body.error || 'Group storage grants unavailable right now.',
            grants: [],
            defaultQuota: null,
          });
          setLoadedKey(requestKey);
          return;
        }

        setState({
          loading: false,
          error: null,
          grants: body.grants ?? [],
          defaultQuota: body.defaultQuota ?? null,
        });
        setLoadedKey(requestKey);
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Group storage grants unavailable right now.',
          grants: [],
          defaultQuota: null,
        });
        setLoadedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGroupId, includeTargetsKey, refreshKey]);

  if (!activeGroupId) {
    return initialState;
  }

  const requestKey = `${activeGroupId}:${refreshKey}:${includeTargetsKey}`;
  if (loadedKey !== requestKey && !state.error) {
    return { ...initialState, loading: true };
  }

  return state;
}
