'use client';

/**
 * Soft-polls DM unread for the Messages dock badge.
 * Mount once under wallet providers.
 *
 * In-app awareness is the Messages unread pip only — do not toast on unread
 * rises. That would share/clobber the global action toast slot (Collect, txs).
 * Background alerts stay on Web Push when subscribed.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';

const POLL_MS = 20_000;

let globalUnread = 0;
const listeners = new Set<() => void>();
let refreshBridge: (() => Promise<void>) | null = null;

function publishUnread(count: number) {
  if (globalUnread === count) return;
  globalUnread = count;
  for (const listener of listeners) listener();
}

function subscribeUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getUnreadSnapshot(): number {
  return globalUnread;
}

interface DmUnreadContextValue {
  unread: number;
  refresh: () => Promise<void>;
}

const DmUnreadContext = createContext<DmUnreadContextValue | null>(null);

export function useDmUnreadCount(): number {
  const fromContext = useContext(DmUnreadContext)?.unread;
  const fromStore = useSyncExternalStore(
    subscribeUnread,
    getUnreadSnapshot,
    () => 0
  );
  return fromContext ?? fromStore;
}

/** Trigger an immediate unread refresh (e.g. after opening a thread). */
export function requestDmUnreadRefresh(): void {
  void refreshBridge?.();
}

export function DmUnreadHost({ children }: { children?: ReactNode }) {
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const unread = useSyncExternalStore(
    subscribeUnread,
    getUnreadSnapshot,
    () => 0
  );
  const previousAccountRef = useRef<string | null>(null);
  const refreshGenRef = useRef(0);

  useEffect(() => {
    const nextAccount = accountId?.trim().toLowerCase() || null;
    if (previousAccountRef.current !== nextAccount) {
      previousAccountRef.current = nextAccount;
      publishUnread(0);
      refreshGenRef.current += 1;
    }
  }, [accountId]);

  const refresh = useCallback(async () => {
    const gen = refreshGenRef.current;
    if (!accountId || !isConnected || !hasSocialSession) {
      if (gen === refreshGenRef.current) publishUnread(0);
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
      const next = await client.dm.unreadCount();
      if (gen !== refreshGenRef.current) return;
      if (id.trim().toLowerCase() !== accountId.trim().toLowerCase()) return;
      publishUnread(Number.isFinite(next) ? next : 0);
    } catch {
      // Soft poll — ignore transient auth/network errors.
    }
  }, [accountId, getClient, hasSocialSession, isConnected]);

  useEffect(() => {
    refreshBridge = refresh;
    return () => {
      if (refreshBridge === refresh) refreshBridge = null;
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

  const value = useMemo(
    () => ({
      unread,
      refresh,
    }),
    [refresh, unread]
  );

  return (
    <DmUnreadContext.Provider value={value}>
      {children ?? null}
    </DmUnreadContext.Provider>
  );
}
