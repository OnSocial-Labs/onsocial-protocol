'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { APP_SOCIAL_SESSION_MISSING_MESSAGE } from '@/lib/app-social-session';
import {
  deriveMutedAccountIds,
  recordViewerMute,
  reconcileViewerMute,
} from '@/lib/viewer-mute-ledger';
import {
  bumpGlobalViewerMuteLedger,
  clearGlobalViewerMuteState,
  getGlobalApiMutedIds,
  getGlobalViewerMuteLedger,
  getGlobalViewerMuteLedgerVersion,
  isGlobalMutePending,
  setGlobalApiMutedIds,
  setGlobalMutePending,
  subscribeGlobalViewerMuteLedger,
} from '@/lib/viewer-mute-global';
import { isViewerMuting } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const SOFT_RETRY_MS = [2000, 5000] as const;

export function useViewerMute() {
  const { isConnected, hasSocialSession, accountId: viewerAccountId } =
    useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const ledgerRef = useRef(getGlobalViewerMuteLedger());
  const [muteSyncVersion, setMuteSyncVersion] = useState(
    getGlobalViewerMuteLedgerVersion
  );

  useEffect(() => {
    return subscribeGlobalViewerMuteLedger(() => {
      setMuteSyncVersion(getGlobalViewerMuteLedgerVersion());
    });
  }, []);

  const bumpMuteSync = useCallback(() => {
    bumpGlobalViewerMuteLedger();
  }, []);

  const refreshMutes = useCallback(async () => {
    if (!isConnected || !viewerAccountId) {
      clearGlobalViewerMuteState();
      return;
    }
    try {
      const { client, session } = await getClient();
      if (!session) return;
      const { mutes } = await client.mutes.list();
      const ids = mutes.map((m) => m.mutedAccountId);
      setGlobalApiMutedIds(ids);
      for (const id of ids) {
        reconcileViewerMute(ledgerRef.current, id, true);
      }
      bumpMuteSync();
    } catch {
      // Prefs are best-effort; keep ledger overrides.
    }
  }, [bumpMuteSync, getClient, isConnected, viewerAccountId]);

  useEffect(() => {
    void refreshMutes();
  }, [refreshMutes]);

  useEffect(() => {
    if (!isConnected) clearGlobalViewerMuteState();
  }, [isConnected]);

  const softRetryRefresh = useCallback(() => {
    for (const ms of SOFT_RETRY_MS) {
      window.setTimeout(() => {
        void refreshMutes();
      }, ms);
    }
  }, [refreshMutes]);

  const isMutePendingForTarget = useCallback((targetAccountId: string) => {
    return isGlobalMutePending(targetAccountId);
  }, []);

  const updateMute = useCallback(
    async (targetAccountId: string, shouldMute: boolean): Promise<void> => {
      if (!isConnected) {
        throw new Error('Connect your wallet before updating mutes.');
      }
      if (viewerAccountId === targetAccountId) {
        throw new Error('You cannot mute yourself.');
      }
      if (isGlobalMutePending(targetAccountId)) return;

      setGlobalMutePending(targetAccountId, true);
      try {
        const { client, session } = await getClient();
        if (!session) {
          throw new Error(APP_SOCIAL_SESSION_MISSING_MESSAGE);
        }
        if (shouldMute) {
          await client.mutes.add(targetAccountId);
        } else {
          await client.mutes.remove(targetAccountId);
        }
        recordViewerMute(ledgerRef.current, targetAccountId, shouldMute);
        bumpMuteSync();
        softRetryRefresh();
      } catch (error) {
        if (!isWalletUserCancellation(error)) throw error;
      } finally {
        setGlobalMutePending(targetAccountId, false);
      }
    },
    [
      bumpMuteSync,
      getClient,
      isConnected,
      softRetryRefresh,
      viewerAccountId,
    ]
  );

  const mutedAccountIds = deriveMutedAccountIds(
    getGlobalApiMutedIds(),
    ledgerRef.current
  );

  return {
    hasSocialSession,
    isConnected,
    muteSyncVersion,
    mutedAccountIds,
    isMuting: isViewerMuting,
    isMutePendingForTarget,
    updateMute,
    refreshMutes,
  };
}
