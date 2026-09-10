'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Notification } from '@onsocial/sdk';
import {
  OsAppChromePage,
  OsAppChromePageStatus,
  OsSheetAction,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useActivityPostSnippets } from '@/hooks/use-activity-post-snippets';
import { useCollectionDisplayNames } from '@/hooks/use-collection-display-names';
import { useGuildDisplayNames } from '@/hooks/use-guild-display-names';
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
import { resolveAppLoadingPresentation } from '@/lib/app-loading-contract';
import {
  NotificationActivityAppendSkeleton,
  NotificationActivityRows,
  NotificationActivitySkeleton,
} from '@/features/notifications/notification-activity-rows';
import {
  ACTIVITY_EXCLUDE_TYPE,
  isCollectActivityType,
  notificationCollectionIds,
  notificationGroupIds,
  notificationHref,
  notificationProfileAccountIds,
  notificationSnippetPostRefs,
} from '@/lib/notification-display';

const PAGE_SIZE = 40;

/**
 * Activity inbox — standard `OsAppScreen` + connected viewer mood.
 */
export function NotificationsPanel() {
  const router = useRouter();
  const { openAccountSheet } = useAppAccountSheet();
  const { accountId, isConnected, hasSocialSession } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const activityUnread = useNotificationsUnreadCount();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<
    'initial' | 'append' | 'action' | null
  >(null);
  const [markingAll, setMarkingAll] = useState(false);
  const accountGenRef = useRef(0);
  const accountIdRef = useRef(accountId);
  const previousUnreadRef = useRef<number | null>(null);
  const initialLoadRef = useRef<{
    accountId: string;
    generation: number;
    token: object;
  } | null>(null);

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

  const profileIds = useMemo(
    () => notificationProfileAccountIds(items ?? []),
    [items]
  );
  const profiles = usePostAuthorProfiles(profileIds);
  const groupIds = useMemo(
    () => notificationGroupIds(items ?? []),
    [items]
  );
  const guildNames = useGuildDisplayNames(groupIds);
  const collectionIds = useMemo(
    () => notificationCollectionIds(items ?? []),
    [items]
  );
  const collectionNames = useCollectionDisplayNames(collectionIds);
  const snippetRefs = useMemo(
    () => notificationSnippetPostRefs(items ?? []),
    [items]
  );
  const postSnippets = useActivityPostSnippets(snippetRefs);

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
    const activeLoad = initialLoadRef.current;
    if (
      activeLoad &&
      activeLoad.accountId === expected &&
      activeLoad.generation === gen
    ) {
      return;
    }
    const requestToken = {};
    initialLoadRef.current = {
      accountId: expected,
      generation: gen,
      token: requestToken,
    };
    setError(null);
    setErrorSource(null);
    setLoadingInitial(true);
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
      setError(null);
      setErrorSource(null);
      // #region agent log
      console.info(
        JSON.stringify({
          hypothesisId: 'D',
          location: 'notifications-panel.tsx:151',
          message: 'Initial activity load succeeded',
          data: { accountId: id, itemCount: result.notifications.length },
          timestamp: Date.now(),
        })
      );
      // #endregion
      requestNotificationsUnreadRefresh();
    } catch (cause) {
      if (accountGenRef.current !== gen || !isCurrentAccount(expected)) return;
      // #region agent log
      console.info(
        JSON.stringify({
          hypothesisId: 'D',
          location: 'notifications-panel.tsx:166',
          message: 'Initial activity load failed',
          data: {
            accountId: expected,
            error: cause instanceof Error ? cause.message : String(cause),
          },
          timestamp: Date.now(),
        })
      );
      // #endregion
      setError(
        cause instanceof Error ? cause.message : 'Could not load activity.'
      );
      setErrorSource('initial');
      setItems((current) => current ?? []);
    } finally {
      if (initialLoadRef.current?.token === requestToken) {
        initialLoadRef.current = null;
      }
      if (accountGenRef.current === gen && isCurrentAccount(expected)) {
        setLoadingInitial(false);
      }
    }
  }, [accountId, isCurrentAccount, withAuth]);

  useEffect(() => {
    setItems(null);
    setNextCursor(null);
    setLoadingInitial(false);
    setError(null);
    setErrorSource(null);
    previousUnreadRef.current = null;
    if (!isConnected || !accountId || !hasSocialSession) return;
    void loadInitial();
  }, [accountId, hasSocialSession, isConnected, loadInitial]);

  // Soft refresh when host unread rises while viewing Activity.
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
    setError(null);
    setErrorSource(null);
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
      setError(null);
      setErrorSource(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load more activity.'
      );
      setErrorSource('append');
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, isCurrentAccount, loadingMore, nextCursor, withAuth]);

  const markAllRead = useCallback(async () => {
    if (!accountId || markingAll) return;
    setMarkingAll(true);
    setError(null);
    setErrorSource(null);
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
      setErrorSource('action');
    } finally {
      setMarkingAll(false);
    }
  }, [accountId, markingAll, withAuth]);

  const openItem = useCallback(
    (item: Notification) => {
      const collect = isCollectActivityType(item.type);
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
      if (collect) {
        openAccountSheet();
        return;
      }
      router.push(notificationHref(item));
    },
    [accountId, openAccountSheet, router, withAuth]
  );

  const unreadCount = useMemo(
    () => (items ?? []).filter((item) => !item.read).length,
    [items]
  );

  const markAllAction =
    isConnected && hasSocialSession ? (
      <button
        type="button"
        className={`notifications-mark-all${
          unreadCount > 0 ? '' : ' is-slot-reserved'
        }`}
        disabled={markingAll || unreadCount === 0}
        tabIndex={unreadCount > 0 ? undefined : -1}
        aria-hidden={unreadCount > 0 ? undefined : true}
        onClick={() => void markAllRead()}
      >
        {markingAll ? 'Marking…' : 'Mark all read'}
      </button>
    ) : null;

  const hasPaintedRows = Boolean(items && items.length > 0);
  const hasPaintedContent = items !== null;
  const loadingPresentation = loadingMore
    ? resolveAppLoadingPresentation('appending', { hasPaintedRows })
    : loadingInitial
      ? resolveAppLoadingPresentation('refreshing', {
          hasPaintedRows: hasPaintedContent,
        })
      : null;
  const errorPresentation = error
    ? resolveAppLoadingPresentation('error', { hasPaintedRows })
    : null;
  const showActivitySkeleton =
    items == null || loadingPresentation === 'skeleton';
  const showActivityRefreshing = loadingPresentation === 'preserve';
  const showAppendSkeleton = loadingPresentation === 'append-skeleton';
  const retryError = () => {
    if (errorSource === 'append') {
      void loadMore();
    } else if (errorSource === 'action') {
      void markAllRead();
    } else {
      void loadInitial();
    }
  };

  let body: ReactNode;
  if (!isConnected || !accountId) {
    body = (
      <OsAppChromePageStatus>
        Stands, mentions, sales, and more — connect to see activity.
      </OsAppChromePageStatus>
    );
  } else if (!hasSocialSession) {
    body = (
      <OsAppChromePageStatus>
        Connect your session to load activity.
      </OsAppChromePageStatus>
    );
  } else {
    body = (
      <>
        {error ? (
          errorPresentation === 'overlay' ? (
            <OsChromeListAlert
              message={error}
              onRetry={retryError}
            />
          ) : (
            <OsAppChromePageStatus error role="alert">
              {error}
            </OsAppChromePageStatus>
          )
        ) : null}

        {items == null || showActivitySkeleton ? (
          <NotificationActivitySkeleton />
        ) : items.length === 0 ? (
          error ? null : (
            <OsAppChromePageStatus>No activity yet.</OsAppChromePageStatus>
          )
        ) : (
          <>
            <NotificationActivityRows
              items={items}
              profiles={profiles}
              guildNames={guildNames}
              collectionNames={collectionNames}
              postSnippets={postSnippets}
              onOpen={openItem}
              refreshing={showActivityRefreshing}
            />
            {showAppendSkeleton ? <NotificationActivityAppendSkeleton /> : null}
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
      compactChrome
      glassChrome
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      heading={<p className="os-app-screen-title">Activity</p>}
      actions={markAllAction}
    >
      <OsAppChromePage className="notifications-panel">{body}</OsAppChromePage>
    </OsAppScreen>
  );
}
