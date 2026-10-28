'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Notification } from '@onsocial/sdk';
import {
  OsAppChromePage,
  OsAppChromePageStatus,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useActivityPostSnippets } from '@/hooks/use-activity-post-snippets';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useListScrollRestore } from '@/hooks/use-list-scroll-restore';
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
import { getAppLenis } from '@/lib/app-lenis-registry';
import { APP_HOME_PATH, messagesPath } from '@/lib/app-routes';
import { accountIdsEqual } from '@/lib/account-match';
import {
  peekActivityInboxSession,
  readActivityInboxSession,
  writeActivityInboxSession,
} from '@/lib/activity-inbox-session';
import { resolveAppLoadingPresentation } from '@/lib/app-loading-contract';
import {
  createListScrollMemory,
  resetListScrollMemory,
  scrollTopToPersist,
} from '@/lib/list-scroll-restore';
import {
  NotificationActivityAppendSkeleton,
  NotificationActivityRows,
  NotificationActivitySkeleton,
} from '@/features/notifications/notification-activity-rows';
import {
  ACTIVITY_EXCLUDE_TYPE,
  activityTabTypeParam,
  isCollectActivityType,
  notificationCollectionIds,
  notificationGroupIds,
  notificationHref,
  notificationProfileAccountIds,
  notificationSnippetPostRefs,
} from '@/lib/notification-display';
import type { ActivityInboxTab } from '@/lib/notification-display';

const PAGE_SIZE = 40;

/**
 * Activity inbox — standard `OsAppScreen` + connected viewer mood.
 */
export function NotificationsPanel() {
  const router = useRouter();
  const { openAccountSheet } = useAppAccountSheet();
  const {
    accountId,
    isConnected,
    hasSocialSession,
    isLoading,
    isBootstrappingSession,
  } = useAppWallet();
  const authPending = isLoading || isBootstrappingSession;
  const { getClient } = useAppOnSocialClient();
  const activityUnread = useNotificationsUnreadCount();
  const restoredSessionRef = useRef(peekActivityInboxSession());
  const restoredSession = restoredSessionRef.current;
  const [items, setItems] = useState<Notification[] | null>(
    () => restoredSession?.items ?? null
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => restoredSession?.nextCursor ?? null
  );
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<
    'initial' | 'append' | 'action' | null
  >(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [tab, setTab] = useState<ActivityInboxTab>('all');
  const [mentionsUnread, setMentionsUnread] = useState(0);
  const accountGenRef = useRef(0);
  const mentionsCountReqRef = useRef(0);
  const accountIdRef = useRef(accountId);
  const tabRef = useRef<ActivityInboxTab>('all');
  /** Per-tab painted rows + scroll line so back-switches land where you left. */
  const tabCacheRef = useRef<
    Partial<
      Record<
        ActivityInboxTab,
        {
          items: Notification[] | null;
          nextCursor: string | null;
          scrollTop: number;
        }
      >
    >
  >({});
  const previousUnreadRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  const nextCursorRef = useRef(nextCursor);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const scrollMemoryRef = useRef(
    createListScrollMemory(restoredSession?.scrollTop ?? 0)
  );

  useLayoutEffect(() => {
    itemsRef.current = items;
    nextCursorRef.current = nextCursor;
    accountIdRef.current = accountId;
    tabRef.current = tab;
  }, [accountId, items, nextCursor, tab]);

  useEffect(() => {
    return () => {
      // Session restore is All-tab scoped; Mentions rows would paint wrong.
      if (tabRef.current !== 'all') return;
      const live = scrollRootRef.current?.scrollTop ?? 0;
      writeActivityInboxSession({
        accountId: accountIdRef.current,
        items: itemsRef.current,
        nextCursor: nextCursorRef.current,
        scrollTop: scrollTopToPersist(scrollMemoryRef.current, live),
      });
    };
  }, []);

  // Revision keys on the tab too: equal-length tab swaps must still restore.
  useListScrollRestore(
    scrollRootRef,
    scrollMemoryRef,
    `${tab}:${items?.length ?? 'cold'}`
  );

  useEffect(() => {
    accountGenRef.current += 1;
  }, [accountId]);

  const isCurrentAccount = useCallback(
    (expected: string | null | undefined) => {
      if (!expected) return false;
      const current = accountIdRef.current;
      return Boolean(
        current && current.toLowerCase() === expected.toLowerCase()
      );
    },
    []
  );

  const profileIds = useMemo(
    () => notificationProfileAccountIds(items ?? []),
    [items]
  );
  const profiles = usePostAuthorProfiles(profileIds);
  const groupIds = useMemo(() => notificationGroupIds(items ?? []), [items]);
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

  const loadMentionsUnread = useCallback(async () => {
    if (!accountId) return;
    const gen = accountGenRef.current;
    const expected = accountId;
    const req = ++mentionsCountReqRef.current;
    const stillCurrent = () =>
      mentionsCountReqRef.current === req &&
      accountGenRef.current === gen &&
      isCurrentAccount(expected);
    try {
      const { client, accountId: id } = await withAuth();
      if (!stillCurrent()) return;
      const count = await client.notifications.unreadCount(id, {
        excludeType: ACTIVITY_EXCLUDE_TYPE,
        type: activityTabTypeParam('mentions'),
      });
      if (!stillCurrent()) return;
      setMentionsUnread(Number.isFinite(count) ? count : 0);
    } catch {
      // The chip keeps the last count. The dock poll retries.
    }
  }, [accountId, isCurrentAccount, withAuth]);

  const prefetchMentions = useCallback(async () => {
    if (!accountId) return;
    const gen = accountGenRef.current;
    const expected = accountId;
    try {
      const { client, accountId: id } = await withAuth();
      if (accountGenRef.current !== gen || !isCurrentAccount(expected)) return;
      // Read through a function so the two checks stay independent.
      // A direct `tabRef.current` compare narrows the ref for the rest of the callback.
      const openTab = (): ActivityInboxTab => tabRef.current;
      // The open Mentions tab owns its rows. A background write would
      // replace the line the user is already on.
      if (openTab() === 'mentions') return;
      const result = await client.notifications.list({
        recipient: id,
        limit: PAGE_SIZE,
        excludeType: ACTIVITY_EXCLUDE_TYPE,
        type: activityTabTypeParam('mentions'),
      });
      if (accountGenRef.current !== gen || !isCurrentAccount(expected)) return;
      if (openTab() === 'mentions') {
        if (itemsRef.current == null) {
          setItems(result.notifications);
          setNextCursor(result.nextCursor);
          setLoadingInitial(false);
        }
        return;
      }
      const previous = tabCacheRef.current.mentions;
      tabCacheRef.current.mentions = {
        items: result.notifications,
        nextCursor: result.nextCursor,
        scrollTop: previous?.scrollTop ?? 0,
      };
    } catch {
      // Opening Mentions runs its own load.
    }
  }, [accountId, isCurrentAccount, withAuth]);

  const loadInitial = useCallback(
    async (forTab: ActivityInboxTab) => {
      if (!accountId) return;
      const gen = accountGenRef.current;
      const expected = accountId;
      const isLive = () =>
        accountGenRef.current === gen &&
        isCurrentAccount(expected) &&
        tabRef.current === forTab;
      setError(null);
      setErrorSource(null);
      setLoadingInitial(true);
      try {
        const { client, accountId: id } = await withAuth();
        if (!isLive()) return;
        const result = await client.notifications.list({
          recipient: id,
          limit: PAGE_SIZE,
          excludeType: ACTIVITY_EXCLUDE_TYPE,
          type: activityTabTypeParam(forTab),
        });
        if (!isLive()) return;
        setItems(result.notifications);
        setNextCursor(result.nextCursor);
        setError(null);
        setErrorSource(null);
        requestNotificationsUnreadRefresh();
        if (forTab === 'all') void prefetchMentions();
      } catch (cause) {
        if (!isLive()) return;
        setError(
          cause instanceof Error ? cause.message : 'Could not load activity.'
        );
        setErrorSource('initial');
        setItems((current) => current ?? []);
      } finally {
        if (isLive()) {
          setLoadingInitial(false);
        }
      }
    },
    [accountId, isCurrentAccount, prefetchMentions, withAuth]
  );

  const fetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isConnected || !accountId || !hasSocialSession) {
      fetchKeyRef.current = null;
      return;
    }
    const accountChanged =
      fetchKeyRef.current == null ||
      !accountIdsEqual(fetchKeyRef.current, accountId);
    fetchKeyRef.current = accountId;
    if (accountChanged) {
      previousUnreadRef.current = null;
      tabCacheRef.current = {};
      const restored = restoredSessionRef.current;
      if (restored && !accountIdsEqual(restored.accountId, accountId)) {
        restoredSessionRef.current = null;
        setItems(null);
        setNextCursor(null);
        resetListScrollMemory(scrollMemoryRef.current, 0);
      } else if (restored && tabRef.current === 'all') {
        const matched = readActivityInboxSession(accountId);
        if (matched) {
          setItems(matched.items);
          setNextCursor(matched.nextCursor);
        }
      }
    }
    void loadInitial(tab);
  }, [accountId, hasSocialSession, isConnected, loadInitial, tab]);

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
      void loadInitial(tabRef.current);
    }
  }, [accountId, activityUnread, hasSocialSession, isConnected, loadInitial]);

  useEffect(() => {
    if (!isConnected || !accountId || !hasSocialSession) {
      setMentionsUnread(0);
      return;
    }
    void loadMentionsUnread();
  }, [
    accountId,
    activityUnread,
    hasSocialSession,
    isConnected,
    loadMentionsUnread,
  ]);

  const selectTab = useCallback((next: ActivityInboxTab) => {
    if (next === tabRef.current) return;
    tabCacheRef.current[tabRef.current] = {
      items: itemsRef.current,
      nextCursor: nextCursorRef.current,
      scrollTop: scrollRootRef.current?.scrollTop ?? 0,
    };
    const cached = tabCacheRef.current[next];
    // Flip the ref synchronously so in-flight fetches for the old tab
    // fail their liveness guard before the state commit lands.
    tabRef.current = next;
    setTab(next);
    setItems(cached?.items ?? null);
    setNextCursor(cached?.nextCursor ?? null);
    setError(null);
    setErrorSource(null);
    // A mid-flight append on the old tab fails its liveness guard and
    // never clears the flag — reset here so the new tab's sentinel works.
    setLoadingMore(false);
    const targetTop = cached?.scrollTop ?? 0;
    resetListScrollMemory(scrollMemoryRef.current, targetTop);
    if (targetTop <= 0) {
      // Restore hook no-ops at the top line — go through Lenis directly so a
      // longer cached list cannot keep the previous tab's scrolled line.
      const node = scrollRootRef.current;
      if (node) {
        const lenis = getAppLenis(node);
        if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
        else node.scrollTo({ top: 0 });
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!accountId || !nextCursor || loadingMore) return;
    const forTab = tabRef.current;
    const gen = accountGenRef.current;
    const isLive = () =>
      accountGenRef.current === gen &&
      isCurrentAccount(accountId) &&
      tabRef.current === forTab;
    setLoadingMore(true);
    setError(null);
    setErrorSource(null);
    try {
      const { client, accountId: id } = await withAuth();
      if (!isLive()) return;
      const result = await client.notifications.list({
        recipient: id,
        limit: PAGE_SIZE,
        cursor: nextCursor,
        excludeType: ACTIVITY_EXCLUDE_TYPE,
        type: activityTabTypeParam(forTab),
      });
      if (!isLive()) return;
      setItems((prev) => [...(prev ?? []), ...result.notifications]);
      setNextCursor(result.nextCursor);
      setError(null);
      setErrorSource(null);
    } catch (cause) {
      if (!isLive()) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not load more activity.'
      );
      setErrorSource('append');
    } finally {
      if (isLive()) {
        setLoadingMore(false);
      }
    }
  }, [accountId, isCurrentAccount, loadingMore, nextCursor, withAuth]);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  // Append failures gate the sentinel off so a visible sentinel cannot
  // busy-loop; the append error's Try again retries via retryError.
  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreSentinelRef,
    enabled:
      nextCursor != null &&
      !loadingMore &&
      !(error != null && errorSource === 'append'),
    onIntersect: loadMore,
  });

  const markAllRead = useCallback(async () => {
    if (!accountId || markingAll) return;
    setMarkingAll(true);
    setError(null);
    setErrorSource(null);
    try {
      const { client, accountId: id } = await withAuth();
      const type = activityTabTypeParam(tabRef.current);
      await client.notifications.markRead(id, {
        all: true,
        excludeType: ACTIVITY_EXCLUDE_TYPE,
        type,
      });
      const included = type ? new Set(type.split(',')) : null;
      const markRow = (item: Notification) =>
        included == null || included.has(item.type)
          ? { ...item, read: true }
          : item;
      setItems((prev) => (prev ? prev.map(markRow) : prev));
      for (const key of ['all', 'mentions'] as const) {
        const cached = tabCacheRef.current[key];
        if (!cached?.items) continue;
        tabCacheRef.current[key] = {
          ...cached,
          items: cached.items.map(markRow),
        };
      }
      mentionsCountReqRef.current += 1;
      setMentionsUnread(0);
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
    (group: Notification[]) => {
      const item = group[0];
      if (!item) return;
      const collect = isCollectActivityType(item.type);
      const unreadIds = group.filter((row) => !row.read).map((row) => row.id);
      if (unreadIds.length > 0 && accountId) {
        const mark = (row: Notification) =>
          unreadIds.includes(row.id) ? { ...row, read: true } : row;
        setItems((prev) => (prev ? prev.map(mark) : prev));
        for (const key of ['all', 'mentions'] as const) {
          const cached = tabCacheRef.current[key];
          if (!cached?.items) continue;
          tabCacheRef.current[key] = {
            ...cached,
            items: cached.items.map(mark),
          };
        }
        void (async () => {
          try {
            const { client, accountId: id } = await withAuth();
            await client.notifications.markRead(id, { ids: unreadIds });
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

  const showActivityChrome = authPending || (isConnected && hasSocialSession);

  const markAllAction = showActivityChrome ? (
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

  const showActivityTabs = showActivityChrome;
  const activityTabsTrackRef = useRef<HTMLDivElement | null>(null);
  const activityTabsThumbRef = useRef<HTMLSpanElement | null>(null);

  // Quotes-track recipe: a thumb span measured under the active tab; the
  // CSS transition does the slide (no swipe pager on this screen).
  const placeActivityTabsThumb = useCallback(() => {
    const track = activityTabsTrackRef.current;
    const thumb = activityTabsThumbRef.current;
    if (!track || !thumb) return;
    const active = track.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    );
    if (!active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.height = `${active.offsetHeight}px`;
    thumb.style.transform = `translate3d(${active.offsetLeft}px, ${active.offsetTop}px, 0)`;
  }, []);

  useLayoutEffect(() => {
    placeActivityTabsThumb();
  });

  useLayoutEffect(() => {
    if (!showActivityTabs) return undefined;
    const track = activityTabsTrackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => placeActivityTabsThumb());
    observer.observe(track);
    return () => observer.disconnect();
  }, [showActivityTabs, placeActivityTabsThumb]);

  const activityTabs = showActivityTabs ? (
    <div
      ref={activityTabsTrackRef}
      className="app-storage-mode-toggle post-quotes-track notifications-activity-tabs"
      role="tablist"
      aria-label="Activity filter"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        selectTab(event.key === 'ArrowRight' ? 'mentions' : 'all');
      }}
    >
      <span
        ref={activityTabsThumbRef}
        className="post-quotes-track-thumb notifications-activity-tabs-thumb"
        aria-hidden
      />
      <button
        type="button"
        role="tab"
        id="notifications-activity-tab-all"
        aria-selected={tab === 'all'}
        tabIndex={tab === 'all' ? 0 : -1}
        className={`app-storage-mode os-disabled-ink${tab === 'all' ? ' is-active' : ''}`}
        onClick={() => selectTab('all')}
      >
        All
      </button>
      <button
        type="button"
        role="tab"
        id="notifications-activity-tab-mentions"
        aria-selected={tab === 'mentions'}
        tabIndex={tab === 'mentions' ? 0 : -1}
        className={`app-storage-mode os-disabled-ink${tab === 'mentions' ? ' is-active' : ''}`}
        onClick={() => selectTab('mentions')}
      >
        Mentions
        {mentionsUnread > 0 ? (
          <span className="app-storage-mode-count">
            {mentionsUnread > 99 ? '99+' : mentionsUnread}
          </span>
        ) : null}
      </button>
    </div>
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
      void loadInitial(tabRef.current);
    }
  };

  const showRestoredInbox =
    items != null && (authPending || (isConnected && hasSocialSession));

  let body: ReactNode;
  if (showRestoredInbox || (isConnected && hasSocialSession && accountId)) {
    body = (
      <>
        {error ? (
          errorPresentation === 'overlay' ? (
            <OsChromeListAlert message={error} onRetry={retryError} />
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
            <OsAppChromePageStatus>
              {tab === 'mentions' ? 'No mentions yet.' : 'No activity yet.'}
            </OsAppChromePageStatus>
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
              <div
                ref={loadMoreSentinelRef}
                className="notifications-load-sentinel"
                aria-hidden="true"
              />
            ) : null}
          </>
        )}

        <p className="notifications-panel-footnote">
          Private messages live in <Link href={messagesPath()}>Messages</Link>.
        </p>
      </>
    );
  } else if (authPending) {
    body = <NotificationActivitySkeleton />;
  } else if (!isConnected || !accountId) {
    body = (
      <OsAppChromePageStatus>
        Stands, mentions, sales, and more — connect to see activity.
      </OsAppChromePageStatus>
    );
  } else {
    body = (
      <OsAppChromePageStatus>
        Connect your session to load activity.
      </OsAppChromePageStatus>
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
      className="notifications-activity-screen"
      heading={<p className="os-app-screen-title">Activity</p>}
      actions={markAllAction}
      toolbar={activityTabs ?? undefined}
      scrollRootRef={scrollRootRef}
    >
      <OsAppChromePage className="notifications-panel">{body}</OsAppChromePage>
    </OsAppScreen>
  );
}
