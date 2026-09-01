'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { canonicalAccountId } from '@/lib/account-match';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
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

type UseViewerMuteOptions = {
  /** When true, load prefs on connect. Mount once from ViewerMuteBlockHost. */
  bootstrap?: boolean;
};

export function useViewerMute(options: UseViewerMuteOptions = {}) {
  const bootstrap = options.bootstrap === true;
  const {
    isConnected,
    hasSocialSession,
    accountId: viewerAccountId,
  } = useAppWallet();
  const { getClient, getAuthedClient } = useAppOnSocialClient();
  const ledgerRef = useRef(getGlobalViewerMuteLedger());
  const [muteSyncVersion, setMuteSyncVersion] = useState(
    getGlobalViewerMuteLedgerVersion
  );
  const softRetryTimersRef = useRef<number[]>([]);

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
      const { client, session, wallet, accountId } = await getClient();
      if (!session) return;
      // Cached JWT, else silent session-key auth only (no wallet popup on boot).
      let token = getCachedAppGatewayAuth(accountId);
      if (!token) {
        token = await ensureAppGatewayAuth({
          accountId,
          wallet,
          session,
          allowWalletFallback: false,
        });
      }
      client.auth.setToken(token);
      const { mutes } = await client.mutes.list();
      const ids = mutes.map((m) => canonicalAccountId(m.mutedAccountId));
      setGlobalApiMutedIds(ids);
      const apiSet = new Set(ids);
      for (const [accountIdKey] of [...ledgerRef.current.entries()]) {
        reconcileViewerMute(
          ledgerRef.current,
          accountIdKey,
          apiSet.has(canonicalAccountId(accountIdKey))
        );
      }
      bumpMuteSync();
    } catch {
      // Prefs are best-effort; keep ledger overrides.
    }
  }, [bumpMuteSync, getClient, isConnected, viewerAccountId]);

  useEffect(() => {
    if (!bootstrap) return;
    void refreshMutes();
  }, [bootstrap, refreshMutes]);

  useEffect(() => {
    if (!bootstrap) return;
    if (!isConnected) clearGlobalViewerMuteState();
  }, [bootstrap, isConnected]);

  useEffect(() => {
    return () => {
      for (const timer of softRetryTimersRef.current) {
        window.clearTimeout(timer);
      }
      softRetryTimersRef.current = [];
    };
  }, []);

  const softRetryRefresh = useCallback(() => {
    for (const timer of softRetryTimersRef.current) {
      window.clearTimeout(timer);
    }
    softRetryTimersRef.current = SOFT_RETRY_MS.map((ms) =>
      window.setTimeout(() => {
        void refreshMutes();
      }, ms)
    );
  }, [refreshMutes]);

  const isMutePendingForTarget = useCallback((targetAccountId: string) => {
    return isGlobalMutePending(canonicalAccountId(targetAccountId));
  }, []);

  const updateMute = useCallback(
    async (targetAccountId: string, shouldMute: boolean): Promise<void> => {
      const target = canonicalAccountId(targetAccountId);
      if (!isConnected) {
        throw new Error('Connect your wallet before updating mutes.');
      }
      if (viewerAccountId && canonicalAccountId(viewerAccountId) === target) {
        throw new Error('You cannot mute yourself.');
      }
      if (isGlobalMutePending(target)) return;

      setGlobalMutePending(target, true);
      try {
        const { client } = await getAuthedClient();
        if (shouldMute) {
          await client.mutes.add(target);
        } else {
          await client.mutes.remove(target);
        }
        recordViewerMute(ledgerRef.current, target, shouldMute);
        bumpMuteSync();
        softRetryRefresh();
      } catch (error) {
        if (!isWalletUserCancellation(error)) throw error;
      } finally {
        setGlobalMutePending(target, false);
      }
    },
    [
      bumpMuteSync,
      getAuthedClient,
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
