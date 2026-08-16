'use client';

/**
 * Soft-polls first-party notification unread (excludes `dm` — Messages owns that).
 * Mount once under wallet providers.
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
import { usePathname } from 'next/navigation';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
import { APP_NOTIFICATIONS_PATH } from '@/lib/app-routes';
import { ACTIVITY_EXCLUDE_TYPE } from '@/lib/notification-display';
import { txToastSuccess } from '@/lib/transaction-toast-copy';

const POLL_MS = 20_000;
/** Mailbox badge owns DMs — keep activity count free of double-count. */
const EXCLUDE_TYPE = ACTIVITY_EXCLUDE_TYPE;

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

interface NotificationsContextValue {
  unread: number;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null
);

export function useNotificationsUnreadCount(): number {
  const fromContext = useContext(NotificationsContext)?.unread;
  const fromStore = useSyncExternalStore(
    subscribeUnread,
    getUnreadSnapshot,
    () => 0
  );
  return fromContext ?? fromStore;
}

/** Trigger an immediate unread refresh (e.g. after markRead). */
export function requestNotificationsUnreadRefresh(): void {
  void refreshBridge?.();
}

export function NotificationsHost({ children }: { children?: ReactNode }) {
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const pathname = usePathname();
  const unread = useSyncExternalStore(
    subscribeUnread,
    getUnreadSnapshot,
    () => 0
  );
  const previousUnreadRef = useRef<number | null>(null);
  const previousAccountRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  const setTxResultRef = useRef(setTxResult);
  const refreshGenRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    setTxResultRef.current = setTxResult;
  }, [setTxResult]);

  useEffect(() => {
    const nextAccount = accountId?.trim().toLowerCase() || null;
    if (previousAccountRef.current !== nextAccount) {
      previousAccountRef.current = nextAccount;
      previousUnreadRef.current = null;
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
      const next = await client.notifications.unreadCount(id, {
        excludeType: EXCLUDE_TYPE,
      });
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

  // Toast when unread rises while away from Activity (skip first sample).
  useEffect(() => {
    const previous = previousUnreadRef.current;
    previousUnreadRef.current = unread;
    if (previous == null) return;
    const onInbox =
      pathnameRef.current === APP_NOTIFICATIONS_PATH ||
      pathnameRef.current.startsWith(`${APP_NOTIFICATIONS_PATH}/`);
    if (unread > previous && !onInbox) {
      setTxResultRef.current({
        type: 'success',
        msg: txToastSuccess.newNotification,
        actionHref: APP_NOTIFICATIONS_PATH,
        actionLabel: 'Open activity',
      });
    }
  }, [unread]);

  const value = useMemo(
    () => ({
      unread,
      refresh,
    }),
    [refresh, unread]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children ?? null}
    </NotificationsContext.Provider>
  );
}
