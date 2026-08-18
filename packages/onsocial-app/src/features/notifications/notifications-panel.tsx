'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Notification } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  ProfileAvatar,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  requestNotificationsUnreadRefresh,
  useNotificationsUnreadCount,
} from '@/components/providers/notifications-host';
import {
  ensureAppGatewayAuth,
  getCachedAppGatewayAuth,
} from '@/lib/app-gateway-auth';
import { APP_HOME_PATH, messagesPath } from '@/lib/app-routes';
import {
  ACTIVITY_EXCLUDE_TYPE,
  formatNotificationTime,
  notificationDescription,
  notificationHref,
} from '@/lib/notification-display';
import { displayName } from '@/lib/profile-display';

const PAGE_SIZE = 40;

/**
 * Activity inbox — standard `OsAppScreen` + connected viewer mood.
 */
export function NotificationsPanel() {
  const router = useRouter();
  const { accountId, isConnected, connect, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const activityUnread = useNotificationsUnreadCount();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const accountGenRef = useRef(0);
  const accountIdRef = useRef(accountId);
  const previousUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    accountIdRef.current = accountId;
    accountGenRef.current += 1;
  }, [accountId]);

  const isCurrentAccount = useCallback((expected: string | null | undefined) => {
    if (!expected) return false;
    const current = accountIdRef.current;
    return Boolean(
      current && current.toLowerCase() === expected.toLowerCase()
    );
  }, []);

  const actorIds = (items ?? [])
    .map((item) => item.actor)
    .filter((id): id is string => Boolean(id));
  const profiles = usePostAuthorProfiles(actorIds);

  const withAuth = useCallback(async () => {
    const { client, session, wallet, accountId: id } = await getClient();
    if (!session) throw new Error('Session required');
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
    return { client, accountId: id };
  }, [getClient]);

  const loadInitial = useCallback(async () => {
    if (!accountId) return;
    const gen = accountGenRef.current;
    const expected = accountId;
    setError(null);
    try {
      const { client, accountId: id } = await withAuth();
      if (accountGenRef.current !== gen || !isCurrentAccount(expected)) return;
      const result = await client.notifications.list({
        recipient: id,
        limit: PAGE_SIZE,
        excludeType: ACTIVITY_EXCLUDE_TYPE,
      });
      if (accountGenRef.current !== gen || !isCurrentAccount(expected)) return;
      setItems(result.notifications);
      setNextCursor(result.nextCursor);
      requestNotificationsUnreadRefresh();
    } catch (cause) {
      if (accountGenRef.current !== gen || !isCurrentAccount(expected)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not load activity.'
      );
      setItems([]);
      setNextCursor(null);
    }
  }, [accountId, isCurrentAccount, withAuth]);

  useEffect(() => {
    setItems(null);
    setNextCursor(null);
    setError(null);
    previousUnreadRef.current = null;
    if (!isConnected || !accountId || !hasSocialSession) return;
    void loadInitial();
  }, [accountId, hasSocialSession, isConnected, loadInitial]);

  // Soft refresh when host unread rises while viewing Activity (toast suppressed).
  useEffect(() => {
    const previous = previousUnreadRef.current;
    previousUnreadRef.current = activityUnread;
    if (previous == null) return;
    if (
      activityUnread > previous &&
      isConnected &&
      accountId &&
      hasSocialSession
    ) {
      void loadInitial();
    }
  }, [accountId, activityUnread, hasSocialSession, isConnected, loadInitial]);

  const loadMore = useCallback(async () => {
    if (!accountId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const gen = accountGenRef.current;
      const { client, accountId: id } = await withAuth();
      if (accountGenRef.current !== gen || !isCurrentAccount(accountId)) return;
      const result = await client.notifications.list({
        recipient: id,
        limit: PAGE_SIZE,
        cursor: nextCursor,
        excludeType: ACTIVITY_EXCLUDE_TYPE,
      });
      if (accountGenRef.current !== gen || !isCurrentAccount(accountId)) return;
      setItems((prev) => [...(prev ?? []), ...result.notifications]);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load more activity.'
      );
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, isCurrentAccount, loadingMore, nextCursor, withAuth]);

  const markAllRead = useCallback(async () => {
    if (!accountId || markingAll) return;
    setMarkingAll(true);
    setError(null);
    try {
      const { client, accountId: id } = await withAuth();
      await client.notifications.markRead(id, {
        all: true,
        excludeType: ACTIVITY_EXCLUDE_TYPE,
      });
      setItems((prev) =>
        prev ? prev.map((item) => ({ ...item, read: true })) : prev
      );
      requestNotificationsUnreadRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not mark activity read.'
      );
    } finally {
      setMarkingAll(false);
    }
  }, [accountId, markingAll, withAuth]);

  const openItem = useCallback(
    (item: Notification) => {
      const href = notificationHref(item);
      if (!item.read && accountId) {
        setItems((prev) =>
          prev
            ? prev.map((row) =>
                row.id === item.id ? { ...row, read: true } : row
              )
            : prev
        );
        void (async () => {
          try {
            const { client, accountId: id } = await withAuth();
            await client.notifications.markRead(id, { ids: [item.id] });
            requestNotificationsUnreadRefresh();
          } catch {
            // Read state catches up on next poll; navigation already happened.
          }
        })();
      }
      router.push(href);
    },
    [accountId, router, withAuth]
  );

  const unreadCount = useMemo(
    () => (items ?? []).filter((item) => !item.read).length,
    [items]
  );

  const markAllAction =
    isConnected && hasSocialSession && unreadCount > 0 ? (
      <button
        type="button"
        className="notifications-mark-all"
        disabled={markingAll}
        onClick={() => void markAllRead()}
      >
        {markingAll ? 'Marking…' : 'Mark all read'}
      </button>
    ) : null;

  let body: ReactNode;
  if (!isConnected || !accountId) {
    body = (
      <>
        <p className="notifications-panel-empty">
          Connect your wallet to see activity.
        </p>
        <OsSheetActions>
          <OsSheetAction type="button" ready onClick={() => void connect()}>
            Connect
          </OsSheetAction>
        </OsSheetActions>
      </>
    );
  } else if (!hasSocialSession) {
    body = (
      <p className="notifications-panel-empty">
        Connect your session to load activity.
      </p>
    );
  } else {
    body = (
      <>
        {error ? (
          <p className="notifications-panel-error" role="alert">
            {error}
          </p>
        ) : null}

        {items == null ? (
          <p className="notifications-panel-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="notifications-panel-empty">No activity yet.</p>
        ) : (
          <>
            <OsSurfaceRowList as="div" aria-label="Activity">
              {items.map((item) => {
                const actor = item.actor?.trim() || '';
                const profile = actor ? profiles[actor] : undefined;
                const name = actor
                  ? displayName(actor, profile?.displayName)
                  : 'OnSocial';
                const when = formatNotificationTime(item.createdAt);
                const unread = !item.read;
                return (
                  <OsSurfaceRow
                    key={item.id}
                    label={name}
                    description={
                      <span title={when.title || undefined}>
                        {notificationDescription(item)}
                      </span>
                    }
                    leading={
                      <ProfileAvatar
                        src={profile?.avatarUrl ?? undefined}
                        fallbackInitial={name.slice(0, 1)}
                        size="sm"
                      />
                    }
                    badge={unread ? 'New' : undefined}
                    trailing={unread ? undefined : 'navigate'}
                    onClick={() => openItem(item)}
                  />
                );
              })}
            </OsSurfaceRowList>
            {nextCursor ? (
              <div className="notifications-load-more">
                <OsSheetAction
                  type="button"
                  ready={!loadingMore}
                  pending={loadingMore}
                  pendingLabel="Loading…"
                  onClick={() => void loadMore()}
                >
                  Load earlier
                </OsSheetAction>
              </div>
            ) : null}
          </>
        )}

        <p className="notifications-panel-footnote">
          Private messages live in{' '}
          <Link href={messagesPath()}>Messages</Link>.
        </p>
      </>
    );
  }

  return (
    <OsAppScreen
      title="Activity"
      subtitle="Stands, mentions, sales, and more"
      backFallbackHref={APP_HOME_PATH}
      glassChrome
      actions={markAllAction}
    >
      <div className="notifications-panel">{body}</div>
    </OsAppScreen>
  );
}
