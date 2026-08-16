'use client';

/**
 * Soft-polls DM unread count for the signed-in viewer.
 * Mount once under wallet providers — no plaintext, metadata only.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';

const POLL_MS = 20_000;

let globalUnread = 0;
const listeners = new Set<(count: number) => void>();
let refreshImpl: (() => Promise<void>) | null = null;

function publishUnread(count: number) {
  globalUnread = count;
  for (const listener of listeners) listener(count);
}

export function getGlobalDmUnreadCount(): number {
  return globalUnread;
}

export function subscribeDmUnreadCount(
  listener: (count: number) => void
): () => void {
  listeners.add(listener);
  listener(globalUnread);
  return () => {
    listeners.delete(listener);
  };
}

export function useDmUnreadCount(): number {
  const [count, setCount] = useState(globalUnread);
  useEffect(() => subscribeDmUnreadCount(setCount), []);
  return count;
}

/** Trigger an immediate unread refresh (e.g. after markRead). */
export function requestDmUnreadRefresh(): void {
  void refreshImpl?.();
}

export function DmUnreadHost() {
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();

  const refresh = useCallback(async () => {
    if (!accountId || !isConnected || !hasSocialSession) {
      publishUnread(0);
      return;
    }
    try {
      const { client, session, wallet, accountId: id } = await getClient();
      if (!session) return;
      let token = getCachedAppGatewayAuth(id);
      if (!token) {
        token = await ensureAppGatewayAuth({
          accountId: id,
          wallet,
          session,
          allowWalletFallback: true,
        });
      }
      client.auth.setToken(token);
      const { unread } = await client.dm.unreadCount();
      publishUnread(Number.isFinite(unread) ? unread : 0);
    } catch {
      // Soft poll — ignore transient auth/network errors.
    }
  }, [accountId, getClient, hasSocialSession, isConnected]);

  useEffect(() => {
    refreshImpl = refresh;
    return () => {
      if (refreshImpl === refresh) refreshImpl = null;
    };
  }, [refresh]);

  useEffect(() => {
    void refresh();
    if (!isConnected || !hasSocialSession) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [hasSocialSession, isConnected, refresh]);

  return null;
}
