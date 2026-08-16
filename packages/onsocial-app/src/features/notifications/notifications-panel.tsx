'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  ACTIVITY_EXCLUDE_TYPE,
  formatNotificationTime,
  notificationHref,
  notificationVerb,
} from '@/lib/notification-display';
import { displayName } from '@/lib/profile-display';

const PAGE_SIZE = 40;

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

  // Soft refresh when host unread rises while viewing Activity (toast is suppressed).
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

  useEffect(() => {
    if (!isConnected || !accountId || !hasSocialSession) return;
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void loadInitial();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [accountId, hasSocialSession, isConnected, loadInitial]);

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
    async (item: Notification) => {
      const href = notificationHref(item);
      if (!item.read && accountId) {
        try {
          const { client, accountId: id } = await withAuth();
          await client.notifications.markRead(id, { ids: [item.id] });
          setItems((prev) =>
            prev
              ? prev.map((row) =>
                  row.id === item.id ? { ...row, read: true } : row
                )
              : prev
          );
          requestNotificationsUnreadRefresh();
        } catch {
          // Still navigate — read state can catch up on next poll.
        }
      }
      router.push(href);
    },
    [accountId, router, withAuth]
  );

  if (!isConnected || !accountId) {
    return (
      <div className="notifications-panel">
        <header className="notifications-panel-header">
          <h1>Activity</h1>
          <p>Stands, mentions, sales, and more</p>
        </header>
        <p className="notifications-panel-empty">
          Connect your wallet to see activity.
        </p>
        <OsSheetActions>
          <OsSheetAction type="button" ready onClick={() => void connect()}>
            Connect
          </OsSheetAction>
        </OsSheetActions>
      </div>
    );
  }

  if (!hasSocialSession) {
    return (
      <div className="notifications-panel">
        <header className="notifications-panel-header">
          <h1>Activity</h1>
          <p>Stands, mentions, sales, and more</p>
        </header>
        <p className="notifications-panel-empty">
          Connect your session to load activity.
        </p>
      </div>
    );
  }

  const unreadCount = (items ?? []).filter((item) => !item.read).length;

  return (
    <div className="notifications-panel">
      <header className="notifications-panel-header">
        <div className="notifications-panel-heading">
          <h1>Activity</h1>
          <p>Stands, mentions, sales, and more</p>
        </div>
        {items && items.length > 0 ? (
          <OsSheetAction
            type="button"
            variant="ghost"
            ready={unreadCount > 0 && !markingAll}
            pending={markingAll}
            pendingLabel="Marking…"
            onClick={() => void markAllRead()}
          >
            Mark all read
          </OsSheetAction>
        ) : null}
      </header>

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
              const verb = notificationVerb(item.type);
              const when = formatNotificationTime(item.createdAt);
              return (
                <OsSurfaceRow
                  key={item.id}
                  label={name}
                  description={`${verb}${when ? ` · ${when}` : ''}`}
                  leading={
                    <ProfileAvatar
                      src={profile?.avatarUrl ?? undefined}
                      fallbackInitial={name.slice(0, 1)}
                      size="sm"
                    />
                  }
                  badge={!item.read ? 'New' : undefined}
                  trailing="navigate"
                  onClick={() => void openItem(item)}
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
        Private messages live in <Link href="/messages">Messages</Link>.
      </p>
    </div>
  );
}
