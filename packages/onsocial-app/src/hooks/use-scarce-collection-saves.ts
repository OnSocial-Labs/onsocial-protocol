'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  parseScarceCollectionSavePath,
  scarceCollectionContentPath,
} from '@/lib/scarce-save-content-path';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/**
 * Private drop/collection bookmarks via `os.saves`.
 * Optimistic flip + faded pending; `wait: true` until chain confirms.
 */
export function useScarceCollectionSaves(opts: {
  /** Optional ids to seed membership checks for (e.g. open collection page). */
  collectionIds?: ReadonlyArray<string>;
  onError?: (message: string) => void;
} = {}) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const loadIdRef = useRef(0);
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  const seedSignature = useMemo(
    () =>
      (opts.collectionIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean)
        .sort()
        .join('\n') + `\n@${accountId ?? ''}`,
    [opts.collectionIds, accountId]
  );

  const reload = useCallback(async () => {
    if (!accountId) {
      setSavedIds(new Set());
      return;
    }
    const loadId = ++loadIdRef.current;
    try {
      const client = createReadOnlyOnSocialClient();
      const rows = await client.query.saves.list(accountId, { limit: 500 });
      if (loadIdRef.current !== loadId) return;
      const next = new Set<string>();
      for (const row of rows) {
        const id = parseScarceCollectionSavePath(row.contentPath);
        if (id) next.add(id);
      }
      setSavedIds(next);
    } catch {
      if (loadIdRef.current !== loadId) return;
    }
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload, seedSignature]);

  const viewerSaved = useCallback(
    (collectionId: string) => savedIds.has(collectionId.trim()),
    [savedIds]
  );

  const isSavePending = useCallback(
    (collectionId: string) => pendingIds.has(collectionId.trim()),
    [pendingIds]
  );

  const toggleSave = useCallback(
    async (collectionId: string) => {
      const id = collectionId.trim();
      if (!id) return;
      if (pendingIds.has(id)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const path = scarceCollectionContentPath(id);
      const previous = savedIds.has(id);
      const nextSaved = !previous;

      setPendingIds((current) => new Set(current).add(id));
      setSavedIds((current) => {
        const next = new Set(current);
        if (nextSaved) next.add(id);
        else next.delete(id);
        return next;
      });

      try {
        const { client } = await getClient();
        await client.saves.toggle(path, { viewer: accountId, wait: true });
      } catch (cause) {
        setSavedIds((current) => {
          const next = new Set(current);
          if (previous) next.add(id);
          else next.delete(id);
          return next;
        });
        if (!isWalletUserCancellation(cause)) {
          onErrorRef.current?.(
            cause instanceof Error
              ? cause.message
              : 'Could not update bookmark.'
          );
        }
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [
      accountId,
      connect,
      getClient,
      isConnected,
      pendingIds,
      savedIds,
    ]
  );

  return {
    savedIds,
    viewerSaved,
    isSavePending,
    toggleSave,
    reload,
  };
}
