'use client';

/**
 * Soft-polls DM unread count for the signed-in viewer.
 * Mount once under wallet providers — no plaintext, metadata only.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { APP_MESSAGES_PATH } from '@/lib/app-routes';
import { txToastSuccess } from '@/lib/transaction-toast-copy';

const POLL_MS = 20_000;

interface DmUnreadContextValue {
  unread: number;
  refresh: () => Promise<void>;
}

const DmUnreadContext = createContext<DmUnreadContextValue | null>(null);

export function useDmUnreadCount(): number {
  return useContext(DmUnreadContext)?.unread ?? 0;
}

/** Trigger an immediate unread refresh (e.g. after markRead). */
export function requestDmUnreadRefresh(): void {
  // Resolved by provider via module bridge so non-React callers stay simple.
  void refreshBridge?.();
}

let refreshBridge: (() => Promise<void>) | null = null;

export function DmUnreadHost({ children }: { children?: ReactNode }) {
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const previousUnreadRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const refresh = useCallback(async () => {
    if (!accountId || !isConnected || !hasSocialSession) {
      previousUnreadRef.current = 0;
      setUnread(0);
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
      const { unread: next } = await client.dm.unreadCount();
      const count = Number.isFinite(next) ? next : 0;
      const previous = previousUnreadRef.current;
      previousUnreadRef.current = count;
      setUnread(count);
      const onMessages =
        pathnameRef.current === APP_MESSAGES_PATH ||
        pathnameRef.current.startsWith(`${APP_MESSAGES_PATH}/`);
      // Skip the first sample so existing unread doesn't toast on load.
      if (
        previous != null &&
        count > previous &&
        !onMessages
      ) {
        setTxResult({
          type: 'success',
          msg: txToastSuccess.newPrivateMessage,
        });
      }
    } catch {
      // Soft poll — ignore transient auth/network errors.
    }
  }, [accountId, getClient, hasSocialSession, isConnected, setTxResult]);

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
