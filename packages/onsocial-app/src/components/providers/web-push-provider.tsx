'use client';

/**
 * Registers Web Push for Activity when the signed-in viewer opts in.
 * Requires production SW + VAPID on the gateway.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';

type PushPermission = NotificationPermission | 'unsupported';

type WebPushContextValue = {
  supported: boolean;
  permission: PushPermission;
  enabled: boolean;
  configured: boolean;
  busy: boolean;
  /** Request permission, subscribe, and enable push. */
  enable: () => Promise<boolean>;
  /** Soft-disable server-side (keeps browser subscription until revoked). */
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WebPushContext = createContext<WebPushContextValue | null>(null);

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function WebPushProvider({ children }: { children: ReactNode }) {
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermission>('default');
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const accountRef = useRef(accountId);

  useEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);

  useEffect(() => {
    queueMicrotask(() => {
      const ok = pushSupported();
      setSupported(ok);
      if (!ok) {
        setPermission('unsupported');
        return;
      }
      setPermission(Notification.permission);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!accountId || !isConnected || !hasSocialSession) {
      setEnabled(false);
      setConfigured(false);
      return;
    }
    if (!pushSupported()) return;

    try {
      if (!getCachedAppGatewayAuth()?.token) {
        await ensureAppGatewayAuth();
      }
      const client = getClient();
      const status = await client.notifications.getPushStatus();
      if (accountRef.current !== accountId) return;
      setConfigured(status.configured);
      setEnabled(status.enabled);
      setPermission(
        pushSupported() ? Notification.permission : 'unsupported'
      );
    } catch {
      if (accountRef.current !== accountId) return;
      setEnabled(false);
    }
  }, [accountId, getClient, hasSocialSession, isConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!pushSupported() || !accountId || busy) return false;
    setBusy(true);
    try {
      if (!getCachedAppGatewayAuth()?.token) {
        await ensureAppGatewayAuth();
      }
      const client = getClient();
      const publicKey = await client.notifications.getVapidPublicKey();
      if (!publicKey) {
        setConfigured(false);
        return false;
      }
      setConfigured(true);

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') return false;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            publicKey
          ) as BufferSource,
        });
      }

      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) return false;

      // Prefer raw keys when toJSON is incomplete on some engines.
      const p256dhKey =
        p256dh ||
        (subscription.getKey('p256dh')
          ? bufferToBase64Url(subscription.getKey('p256dh')!)
          : null);
      const authKey =
        auth ||
        (subscription.getKey('auth')
          ? bufferToBase64Url(subscription.getKey('auth')!)
          : null);
      if (!p256dhKey || !authKey) return false;

      await client.notifications.subscribePush({
        endpoint,
        p256dh: p256dhKey,
        auth: authKey,
        userAgent: navigator.userAgent,
      });
      setEnabled(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [accountId, busy, getClient]);

  const disable = useCallback(async () => {
    if (!accountId || busy) return;
    setBusy(true);
    try {
      if (!getCachedAppGatewayAuth()?.token) {
        await ensureAppGatewayAuth();
      }
      const client = getClient();
      await client.notifications.setPushEnabled(false);

      if (pushSupported()) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          try {
            await client.notifications.unsubscribePush(subscription.endpoint);
          } catch {
            /* ignore */
          }
          await subscription.unsubscribe().catch(() => undefined);
        }
      }
      setEnabled(false);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [accountId, busy, getClient]);

  const value: WebPushContextValue = {
    supported,
    permission,
    enabled,
    configured,
    busy,
    enable,
    disable,
    refresh,
  };

  return (
    <WebPushContext.Provider value={value}>{children}</WebPushContext.Provider>
  );
}

export function useWebPush(): WebPushContextValue {
  const context = useContext(WebPushContext);
  if (!context) {
    throw new Error('useWebPush must be used within a WebPushProvider');
  }
  return context;
}
