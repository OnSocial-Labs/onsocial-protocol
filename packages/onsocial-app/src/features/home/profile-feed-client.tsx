'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { PulsingDots } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';
import {
  PageDrawerMediaGrid,
  PageDrawerMediaGridSkeleton,
  PROFILE_MEDIA_PAGE_SIZE,
  profileMediaAdvance,
} from '@/components/portfolio/page-drawer-media-grid';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { OsLoadMore } from '@/lib/os-load-more';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import {
  captureVisibleFeedAnchor,
  restoreFeedAnchor,
  type FeedScrollAnchor,
} from '@/features/home/home-feed-scroll-anchor';
import {
  PersonalFeedList,
  insertOptimisticFeedPost,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { PostRowSkeleton } from '@/features/home/post-card';
import type { FeedWindowRangeChange } from '@/features/home/use-feed-window';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { subscribePersonalReplyConfirmed } from '@/features/scarces/drop-compose-host';
import { accountIdsEqual } from '@/lib/account-match';
import { emptyCopy } from '@/lib/empty-copy';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { readAppScrollTop } from '@/lib/app-lenis-registry';
import { feedPageHasMore } from '@/lib/feed-page-cursor';
import type { FeedBlockKeyState } from '@/lib/feed-threads';
import { retainFeedWindowHeights } from '@/lib/feed-window-height-retain';
import { clampHomeFeedCursorAfterTrim } from '@/lib/home-feed-session';
import {
  HOME_FEED_MEMORY_TRIM_IDLE_MS,
  HOME_FEED_WORKING_SET_POSTS,
  homeFeedMemoryTrimNeedsScrollAnchor,
  planHomeFeedMemoryTrim,
} from '@/lib/home-feed-working-set';
import { postKey } from '@/lib/post-display';
import {
  parsePostMedia,
  postVisualMedia,
  revokeOptimisticMediaPreviewUrls,
} from '@/lib/post-media';
import { isRepostRefType } from '@/lib/post-relation';

/** Profile feed sections — Posts / Replies / Reposts / Media. */
export type ProfileFeedTab = 'posts' | 'replies' | 'reposts' | 'media';

/** Text-section page size — matches the prior one-shot section fetch. */
export const PROFILE_FEED_PAGE_SIZE = 24;

type ProfileTextTab = Exclude<ProfileFeedTab, 'media'>;

type SectionPager = {
  nextOffset: number;
  nextBeforeBlockHeight?: number;
  nextBeforeEventKey?: string;
  hasMore: boolean;
  started: boolean;
};

type FeedPageCursor = {
  offset?: number;
  beforeBlockHeight?: number;
  beforePostKey?: string;
};

export type ProfileSectionInFlight = Record<ProfileTextTab, boolean>;

export function emptyProfileSectionInFlight(): ProfileSectionInFlight {
  return { posts: false, replies: false, reposts: false };
}

/** Per-section lock — a mid-load tab switch can start the new section. */
/** Text-tab bucket for a row — posts / replies / reposts are disjoint. */
export function profilePostTextSection(post: PostRow): ProfileTextTab {
  if (post.parentPath) return 'replies';
  if (isRepostRefType(post.refType)) return 'reposts';
  return 'posts';
}

export function beginProfileSectionFetch(
  inFlight: ProfileSectionInFlight,
  section: ProfileTextTab
): boolean {
  if (inFlight[section]) return false;
  inFlight[section] = true;
  return true;
}

export function endProfileSectionFetch(
  inFlight: ProfileSectionInFlight,
  section: ProfileTextTab
): void {
  inFlight[section] = false;
}

function emptySectionPagers(): Record<ProfileTextTab, SectionPager> {
  return {
    posts: { nextOffset: 0, hasMore: false, started: false },
    replies: { nextOffset: 0, hasMore: false, started: false },
    reposts: { nextOffset: 0, hasMore: false, started: false },
  };
}

function emptySectionFlags(): Record<ProfileTextTab, boolean> {
  return emptyProfileSectionInFlight();
}

function emptySectionRequests(): Record<ProfileTextTab, number> {
  return { posts: 0, replies: 0, reposts: 0 };
}

function isProfileTextTab(
  tab: ProfileFeedTab | undefined
): tab is ProfileTextTab {
  return tab === 'posts' || tab === 'replies' || tab === 'reposts';
}

const FEED_TAB_EMPTY: Record<ProfileFeedTab, string> = {
  posts: 'No posts yet',
  replies: 'No replies yet',
  reposts: 'No reposts yet',
  media: 'No media yet',
};

// Posts has no owner hint — the empty state renders a compose action instead.
const FEED_TAB_OWNER_HINT: Partial<Record<ProfileFeedTab, string>> = {
  replies: 'Reply to a post and it will show up here.',
  reposts: 'Repost something and it will show up here.',
  media: 'Posts with photos or video will show up here.',
};

/**
 * The SSR seed only carries the newest posts overall, so sections fetch
 * their own newest rows and top up the pool. Any fetched row missing from
 * the pool is necessarily older than the pool's newest window, so appending
 * keeps the global newest-first order (and optimistic prepends untouched).
 */
const PROFILE_TEXT_SECTIONS = ['posts', 'replies', 'reposts'] as const;

/** Rows that stay after an around-window trim, including one inactive page. */
export function profilePostsAfterMemoryTrim(
  current: readonly PostRow[],
  visiblePosts: readonly PostRow[],
  trimmedPosts: readonly PostRow[],
  activeSection: ProfileTextTab | null
): PostRow[] {
  const keptKeys = new Set(trimmedPosts.map(postKey));
  const visibleKeys = new Set(visiblePosts.map(postKey));
  const inactiveKept: Record<ProfileTextTab, number> = {
    posts: 0,
    replies: 0,
    reposts: 0,
  };
  return current.filter((row) => {
    const key = postKey(row);
    if (visibleKeys.has(key)) return keptKeys.has(key);
    const section = profilePostTextSection(row);
    if (activeSection != null && section === activeSection) return true;
    if (inactiveKept[section] >= PROFILE_FEED_PAGE_SIZE) return false;
    inactiveKept[section] += 1;
    return true;
  });
}

function mergePostRows(current: PostRow[], incoming: PostRow[]): PostRow[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map(postKey));
  const added = incoming.filter((row) => !seen.has(postKey(row)));
  if (added.length === 0) return current;
  return [...current, ...added];
}

interface ProfileFeedClientProps {
  accountId: string;
  posts?: PostRow[];
  postCount?: number;
  /** Section filter — omit for the legacy unfiltered feed. */
  tab?: ProfileFeedTab;
}

/**
 * Interactive profile feed — thread blocks + reply/quote. Owner pen stays on
 * the portfolio dock (`PortfolioPersonalComposer`).
 */
export function ProfileFeedClient({
  accountId,
  posts: initialPosts = [],
  postCount = 0,
  tab,
}: ProfileFeedClientProps) {
  const { accountId: viewerId, isConnected } = useAppWallet();
  const { scrollNode } = usePageContentDrawer();
  const [posts, setPosts] = useState(initialPosts);
  const postsRef = useRef(posts);
  const total = Math.max(postCount, posts.length);
  const [mediaPage, setMediaPage] = useState({
    nextOffset: 0,
    nextBeforeBlockHeight: undefined as number | undefined,
    nextBeforeEventKey: undefined as string | undefined,
    hasMore: false,
    started: false,
  });
  const feedWindowRangeRef = useRef<FeedWindowRangeChange>({
    start: 0,
    end: 0,
    blockCount: 0,
  });
  const [trimAnchor, setTrimAnchor] = useState<FeedScrollAnchor | null>(null);
  const onWindowRangeChange = useCallback((range: FeedWindowRangeChange) => {
    feedWindowRangeRef.current = range;
  }, []);
  const [mediaPaging, setMediaPaging] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const mediaPagingRef = useRef(false);
  const mediaRequestRef = useRef(0);
  const mediaSentinelRef = useRef<HTMLDivElement | null>(null);
  const mediaAccountRef = useRef(accountId);

  const [sectionPages, setSectionPages] = useState(emptySectionPagers);
  const [sectionPagingMap, setSectionPagingMap] = useState(emptySectionFlags);
  const [sectionFailedMap, setSectionFailedMap] = useState(emptySectionFlags);
  const sectionPagingRef = useRef(emptyProfileSectionInFlight());
  const sectionRequestRef = useRef(emptySectionRequests());
  const sectionSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  /** Durable for the drawer lifetime — survives tab switches within a visit. */
  const windowSizeCache = useMemo(
    () => new FeedWindowSizeCache(),
    // Reset key when the drawer changes profile. Not read by the factory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId]
  );
  const blockKeyStatesRef = useRef<Record<ProfileTextTab, FeedBlockKeyState[]>>(
    {
      posts: [],
      replies: [],
      reposts: [],
    }
  );

  const [pendingTab, setPendingTab] = useState<ProfileFeedTab | null>(() =>
    tab === 'posts' && initialPosts.length === 0 && postCount > 0
      ? 'posts'
      : null
  );

  const fetchMediaPage = useCallback(
    (cursor: FeedPageCursor) => {
      if (mediaPagingRef.current) return;
      mediaPagingRef.current = true;
      const requestId = mediaRequestRef.current;
      const isFirst =
        cursor.beforeBlockHeight == null && (cursor.offset ?? 0) === 0;
      queueMicrotask(() => {
        setMediaPaging(true);
        if (isFirst) setPendingTab('media');
      });
      const client = createReadOnlyOnSocialClient();
      void client.query.feed
        .recent({
          author: accountId,
          limit: PROFILE_MEDIA_PAGE_SIZE,
          ...cursor,
        })
        .then((page) => {
          if (requestId !== mediaRequestRef.current) return;
          const seen = new Set(postsRef.current.map(postKey));
          const addedCount = page.items.filter(
            (row) => !seen.has(postKey(row))
          ).length;
          setPosts((current) => mergePostRows(current, page.items));
          setMediaFailed(false);
          const offset = cursor.offset ?? 0;
          const advance = profileMediaAdvance({
            offset,
            pageSize: PROFILE_MEDIA_PAGE_SIZE,
            itemCount: page.items.length,
            addedCount,
          });
          setMediaPage((current) => {
            // A repeated first window can land after paging has already moved on.
            if (
              addedCount <= 0 &&
              cursor.beforeBlockHeight == null &&
              current.nextOffset > offset
            ) {
              return current;
            }
            return {
              nextOffset: advance.offset,
              nextBeforeBlockHeight: page.nextBeforeBlockHeight,
              nextBeforeEventKey: page.nextBeforeEventKey,
              hasMore: feedPageHasMore(page),
              started: true,
            };
          });
        })
        .catch(() => {
          if (requestId !== mediaRequestRef.current) return;
          setMediaFailed(true);
          setMediaPage((current) => ({
            ...current,
            started: true,
            hasMore: true,
          }));
        })
        .finally(() => {
          if (requestId !== mediaRequestRef.current) return;
          mediaPagingRef.current = false;
          setMediaPaging(false);
          setPendingTab((current) => (current === 'media' ? null : current));
        });
    },
    [accountId]
  );

  const fetchSectionPage = useCallback(
    (section: ProfileTextTab, cursor: FeedPageCursor) => {
      if (!beginProfileSectionFetch(sectionPagingRef.current, section)) return;
      const requestId = sectionRequestRef.current[section];
      const isFirst =
        cursor.beforeBlockHeight == null && (cursor.offset ?? 0) === 0;
      queueMicrotask(() => {
        setSectionPagingMap((current) => ({ ...current, [section]: true }));
        setSectionFailedMap((current) => ({ ...current, [section]: false }));
        if (isFirst) setPendingTab(section);
      });
      const client = createReadOnlyOnSocialClient();
      void client.query.feed
        .recent({
          author: accountId,
          limit: PROFILE_FEED_PAGE_SIZE,
          section,
          ...cursor,
        })
        .then((page) => {
          if (requestId !== sectionRequestRef.current[section]) return;
          setPosts((current) => mergePostRows(current, page.items));
          setSectionFailedMap((current) => ({ ...current, [section]: false }));
          setSectionPages((current) => ({
            ...current,
            [section]: {
              nextOffset: cursor.offset ?? 0,
              nextBeforeBlockHeight: page.nextBeforeBlockHeight,
              nextBeforeEventKey: page.nextBeforeEventKey,
              hasMore: feedPageHasMore(page),
              started: true,
            },
          }));
        })
        .catch(() => {
          if (requestId !== sectionRequestRef.current[section]) return;
          setSectionFailedMap((current) => ({ ...current, [section]: true }));
          setSectionPages((current) => ({
            ...current,
            [section]: {
              ...current[section],
              started: true,
              hasMore: true,
            },
          }));
        })
        .finally(() => {
          if (requestId !== sectionRequestRef.current[section]) return;
          endProfileSectionFetch(sectionPagingRef.current, section);
          setSectionPagingMap((current) => ({ ...current, [section]: false }));
          setPendingTab((current) => (current === section ? null : current));
        });
    },
    [accountId]
  );

  useEffect(() => {
    if (mediaAccountRef.current === accountId) return;
    mediaAccountRef.current = accountId;
    mediaRequestRef.current += 1;
    sectionRequestRef.current = {
      posts: sectionRequestRef.current.posts + 1,
      replies: sectionRequestRef.current.replies + 1,
      reposts: sectionRequestRef.current.reposts + 1,
    };
    mediaPagingRef.current = false;
    sectionPagingRef.current = emptyProfileSectionInFlight();
    queueMicrotask(() => {
      setMediaFailed(false);
      setMediaPaging(false);
      setMediaPage({
        nextOffset: 0,
        nextBeforeBlockHeight: undefined,
        nextBeforeEventKey: undefined,
        hasMore: false,
        started: false,
      });
      setSectionFailedMap(emptySectionFlags());
      setSectionPagingMap(emptySectionFlags());
      setSectionPages(emptySectionPagers());
    });
  }, [accountId]);

  const activeTextStarted = isProfileTextTab(tab)
    ? sectionPages[tab].started
    : true;

  useEffect(() => {
    if (!isProfileTextTab(tab) || activeTextStarted) return;
    fetchSectionPage(tab, { offset: 0 });
  }, [tab, activeTextStarted, fetchSectionPage]);

  useEffect(() => {
    if (tab !== 'media' || mediaPage.started) return;
    fetchMediaPage({ offset: 0 });
  }, [tab, mediaPage.started, fetchMediaPage]);

  useEffect(() => {
    return () => {
      for (const post of postsRef.current) {
        revokeOptimisticMediaPreviewUrls(post.value);
      }
    };
  }, []);

  const isOwner =
    isConnected && Boolean(viewerId) && accountIdsEqual(viewerId!, accountId);

  const destinationLabel = useMemo(() => `@${accountId} · Public`, [accountId]);

  const onConfirmed = useCallback(
    (post: PostRow, parent?: PostRow | null) => {
      if (post.accountId !== accountId) return;
      if (!shouldPrependOptimisticFeedPost(post)) return;
      setPosts((current) => insertOptimisticFeedPost(current, post, parent));
    },
    [accountId]
  );

  useEffect(
    () =>
      subscribePersonalReplyConfirmed(({ parent, reply }) => {
        onConfirmed(reply, parent);
      }),
    [onConfirmed]
  );

  const onUnreposted = useCallback(
    (target: PostRow) => {
      if (!viewerId) return;
      const targetPath = postContentPath(target);
      setPosts((current) =>
        current.filter(
          (row) =>
            !(
              row.accountId === viewerId &&
              row.refType === 'repost' &&
              row.refPath === targetPath
            )
        )
      );
    },
    [viewerId]
  );

  const {
    openPost,
    openReply,
    openFullReply,
    openQuote,
    openRepost,
    openUndoRepost,
    sheet,
  } = usePersonalComposer({
    registerPen: false,
    replyDockEnabled: true,
    destinationLabel,
    onConfirmed,
    onUnreposted,
  });

  const replyHandler = openReply;
  const quoteHandler = isConnected ? openQuote : undefined;
  const repostHandler = isConnected ? openRepost : undefined;
  const undoRepostHandler = isConnected ? openUndoRepost : undefined;

  const visiblePosts = useMemo(() => {
    if (!tab) return posts;
    if (tab === 'posts') {
      return posts.filter(
        (post) => !post.parentPath && !isRepostRefType(post.refType)
      );
    }
    if (tab === 'replies') {
      return posts.filter((post) => Boolean(post.parentPath));
    }
    if (tab === 'reposts') {
      return posts.filter((post) => isRepostRefType(post.refType));
    }
    return posts.filter(
      (post) => postVisualMedia(parsePostMedia(post.value)).length > 0
    );
  }, [posts, tab]);

  const activeSection = isProfileTextTab(tab) ? tab : null;
  const activeSectionPage = activeSection ? sectionPages[activeSection] : null;
  const onBlockKeyState = useCallback(
    (state: FeedBlockKeyState[]) => {
      if (!activeSection) return;
      blockKeyStatesRef.current[activeSection] = state;
    },
    [activeSection]
  );

  const mediaLooking =
    tab === 'media' &&
    visiblePosts.length === 0 &&
    mediaPage.hasMore &&
    !mediaFailed;

  const loadOlderMedia = useCallback(() => {
    if (tab !== 'media' || !mediaPage.hasMore || mediaPagingRef.current) return;
    const before = mediaPage.nextBeforeBlockHeight;
    const beforeKey = mediaPage.nextBeforeEventKey?.trim();
    if (before === undefined || !beforeKey) return;
    setMediaFailed(false);
    fetchMediaPage({
      beforeBlockHeight: before,
      beforePostKey: beforeKey,
    });
  }, [
    tab,
    mediaPage.hasMore,
    mediaPage.nextBeforeBlockHeight,
    mediaPage.nextBeforeEventKey,
    fetchMediaPage,
  ]);

  const sectionPaging = activeSection ? sectionPagingMap[activeSection] : false;
  const sectionFailed = activeSection ? sectionFailedMap[activeSection] : false;

  const loadOlderSection = useCallback(() => {
    if (!activeSection || !activeSectionPage) return;
    if (!activeSectionPage.hasMore || sectionPagingRef.current[activeSection]) {
      return;
    }
    setSectionFailedMap((current) => ({
      ...current,
      [activeSection]: false,
    }));
    const before = activeSectionPage.nextBeforeBlockHeight;
    const beforeKey = activeSectionPage.nextBeforeEventKey?.trim();
    if (before === undefined || !beforeKey) return;
    fetchSectionPage(activeSection, {
      beforeBlockHeight: before,
      beforePostKey: beforeKey,
    });
  }, [activeSection, activeSectionPage, fetchSectionPage]);

  // No covers yet — keep walking so an older photo is not reported missing.
  useEffect(() => {
    if (!mediaLooking || mediaPaging) return;
    const before = mediaPage.nextBeforeBlockHeight;
    const beforeKey = mediaPage.nextBeforeEventKey?.trim();
    fetchMediaPage(
      before !== undefined && beforeKey
        ? { beforeBlockHeight: before, beforePostKey: beforeKey }
        : { offset: 0 }
    );
  }, [
    mediaLooking,
    mediaPaging,
    mediaPage.nextBeforeBlockHeight,
    mediaPage.nextBeforeEventKey,
    fetchMediaPage,
  ]);

  // Keyset load-more — around-window trim like home on the active tab.
  const memoryTrimTimerRef = useRef<number | null>(null);
  const maybeTrimFeedMemory = useCallback(() => {
    if (sectionPaging || mediaPaging) return;
    if (visiblePosts.length <= HOME_FEED_WORKING_SET_POSTS) return;
    if (!(scrollNode instanceof HTMLElement)) return;
    const range = feedWindowRangeRef.current;
    const trimmed = planHomeFeedMemoryTrim({
      posts: visiblePosts,
      scrollTop: readAppScrollTop(scrollNode),
      windowStart: range.start,
      windowEnd: range.end,
    });
    if (trimmed.droppedHead.length === 0 && trimmed.droppedTail.length === 0) {
      return;
    }
    if (homeFeedMemoryTrimNeedsScrollAnchor(trimmed)) {
      setTrimAnchor(captureVisibleFeedAnchor(scrollNode));
    }
    // Cap inactive text sections to one page (newest-first) so tab hops
    // do not grow the shared list without bound.
    const base = postsRef.current;
    const surviving = profilePostsAfterMemoryTrim(
      base,
      visiblePosts,
      trimmed.posts,
      activeSection
    );
    // Active section keeps the list's stable keys. Other sections keep tip
    // keys — a tab change reassigns against the other tab, so overlap is 0.
    const states = retainFeedWindowHeights(
      windowSizeCache,
      PROFILE_TEXT_SECTIONS.map((section) => ({
        posts: surviving.filter(
          (post) => profilePostTextSection(post) === section
        ),
        previous:
          section === activeSection ? blockKeyStatesRef.current[section] : [],
        options:
          section === 'replies' ? { includeForeignReplies: true } : undefined,
      }))
    );
    blockKeyStatesRef.current = {
      posts: states[0] ?? [],
      replies: states[1] ?? [],
      reposts: states[2] ?? [],
    };
    setPosts((current) =>
      current === base
        ? surviving
        : profilePostsAfterMemoryTrim(
            current,
            visiblePosts,
            trimmed.posts,
            activeSection
          )
    );
    if (activeSection) {
      const clamped = clampHomeFeedCursorAfterTrim({
        posts: trimmed.posts,
        nextOffset: sectionPages[activeSection].nextOffset,
        nextBeforeBlockHeight:
          sectionPages[activeSection].nextBeforeBlockHeight,
        nextBeforeEventKey: sectionPages[activeSection].nextBeforeEventKey,
        offsetShiftApplied: 0,
      });
      setSectionPages((current) => ({
        ...current,
        [activeSection]: {
          ...current[activeSection],
          nextOffset: clamped.nextOffset ?? current[activeSection].nextOffset,
          nextBeforeBlockHeight: clamped.nextBeforeBlockHeight,
          nextBeforeEventKey: clamped.nextBeforeEventKey,
          hasMore: feedPageHasMore(clamped),
        },
      }));
    }
  }, [
    activeSection,
    mediaPaging,
    scrollNode,
    sectionPages,
    sectionPaging,
    visiblePosts,
    windowSizeCache,
  ]);
  useEffect(() => {
    if (!(scrollNode instanceof HTMLElement)) return;
    const onScroll = () => {
      if (memoryTrimTimerRef.current != null) {
        window.clearTimeout(memoryTrimTimerRef.current);
      }
      memoryTrimTimerRef.current = window.setTimeout(() => {
        memoryTrimTimerRef.current = null;
        maybeTrimFeedMemory();
      }, HOME_FEED_MEMORY_TRIM_IDLE_MS);
    };
    scrollNode.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollNode.removeEventListener('scroll', onScroll);
      if (memoryTrimTimerRef.current != null) {
        window.clearTimeout(memoryTrimTimerRef.current);
        memoryTrimTimerRef.current = null;
      }
    };
  }, [maybeTrimFeedMemory, scrollNode, visiblePosts.length]);

  useLayoutEffect(() => {
    if (!trimAnchor || !(scrollNode instanceof HTMLElement)) return;
    if (restoreFeedAnchor(scrollNode, trimAnchor)) {
      setTrimAnchor(null);
    }
  }, [posts, scrollNode, trimAnchor]);

  useInfiniteScrollSentinel({
    root: scrollNode,
    sentinelRef: mediaSentinelRef,
    enabled:
      tab === 'media' &&
      mediaPage.hasMore &&
      !mediaFailed &&
      !mediaPaging &&
      visiblePosts.length > 0,
    onIntersect: loadOlderMedia,
  });

  useInfiniteScrollSentinel({
    root: scrollNode,
    sentinelRef: sectionSentinelRef,
    enabled:
      Boolean(activeSection) &&
      Boolean(activeSectionPage?.hasMore) &&
      !sectionFailed &&
      !sectionPaging &&
      visiblePosts.length > 0,
    onIntersect: loadOlderSection,
  });

  const emptyTitle = tab
    ? FEED_TAB_EMPTY[tab]
    : total > 0
      ? `${total} indexed`
      : 'No posts yet';
  /** One tappable action on the main posts empty state; other tabs keep hints. */
  const showOwnerComposeAction =
    isOwner && (tab ? tab === 'posts' : total === 0);
  const emptyHint = showOwnerComposeAction
    ? null
    : tab
      ? isOwner
        ? FEED_TAB_OWNER_HINT[tab]
        : emptyCopy.nothingHereYet
      : total > 0
        ? 'Indexed posts could not be loaded right now.'
        : 'Nothing published yet.';

  if (visiblePosts.length === 0) {
    // Don't claim "No replies yet" while the section fetch is in flight.
    if (
      (tab && pendingTab === tab) ||
      mediaLooking ||
      (tab === 'media' && mediaPaging && visiblePosts.length === 0) ||
      (activeSection &&
        sectionPaging &&
        visiblePosts.length === 0 &&
        !sectionFailed)
    ) {
      return (
        <>
          {tab === 'media' ? (
            <PageDrawerMediaGridSkeleton />
          ) : (
            <PostRowSkeleton rows={3} />
          )}
          {sheet}
        </>
      );
    }
    if (tab === 'media' && mediaFailed) {
      return (
        <>
          <OsPageBodyAppear>
            <div className="home-feed-state">
              <span>{emptyTitle}</span>
              <span>{emptyHint}</span>
            </div>
            <OsLoadMore onClick={loadOlderMedia} pending={mediaPaging}>
              Show earlier
            </OsLoadMore>
          </OsPageBodyAppear>
          {sheet}
        </>
      );
    }
    if (activeSection && sectionFailed) {
      return (
        <>
          <OsPageBodyAppear>
            <div className="home-feed-state">
              <span>{emptyTitle}</span>
              <span>{emptyHint}</span>
            </div>
            <OsLoadMore onClick={loadOlderSection} pending={sectionPaging}>
              Show earlier
            </OsLoadMore>
          </OsPageBodyAppear>
          {sheet}
        </>
      );
    }
    return (
      <>
        <OsPageBodyAppear>
          {/* Tabs already name the section — lead line only on the legacy page. */}
          {!tab ? (
            <p className="panel-lead">
              Public posts from <strong>@{accountId}</strong>.
            </p>
          ) : null}
          <div className="home-feed-state">
            <span>{emptyTitle}</span>
            {showOwnerComposeAction ? (
              <button
                type="button"
                className="profile-feed-compose-teaser"
                onClick={() => openPost()}
              >
                Write your first post.
              </button>
            ) : (
              <span>{emptyHint}</span>
            )}
          </div>
        </OsPageBodyAppear>
        {sheet}
      </>
    );
  }

  return (
    <>
      {!tab ? (
        <p className="panel-lead">
          Public posts from <strong>@{accountId}</strong>
          {total > posts.length ? ` · showing ${posts.length}` : null}.
        </p>
      ) : null}
      {tab === 'media' ? (
        <>
          <PageDrawerMediaGrid posts={visiblePosts} />
          {mediaFailed ? (
            <OsLoadMore onClick={loadOlderMedia} pending={mediaPaging}>
              Show earlier
            </OsLoadMore>
          ) : (
            <div
              ref={mediaSentinelRef}
              className="page-drawer-media-sentinel"
              aria-hidden
            />
          )}
        </>
      ) : (
        <>
          <PersonalFeedList
            posts={visiblePosts}
            includeForeignReplies={tab === 'replies'}
            onReply={replyHandler}
            onExpandReply={openFullReply}
            onQuote={quoteHandler}
            onRepost={repostHandler}
            onUndoRepost={undoRepostHandler}
            className="home-feed-list"
            windowSizeCache={windowSizeCache}
            pinnedFeedKey={trimAnchor?.key ?? null}
            onWindowRangeChange={onWindowRangeChange}
            onBlockKeyState={onBlockKeyState}
          />
          {activeSection ? (
            sectionFailed ? (
              <OsLoadMore onClick={loadOlderSection} pending={sectionPaging}>
                Show earlier
              </OsLoadMore>
            ) : activeSectionPage?.hasMore ? (
              <div
                ref={sectionSentinelRef}
                className="home-feed-sentinel"
                aria-hidden
              />
            ) : null
          ) : null}
        </>
      )}
      {(tab === 'media' && mediaPaging) ||
      (activeSection && sectionPaging && visiblePosts.length > 0) ? (
        <div className="list-append-pending">
          <PulsingDots size="sm" label="Loading more" />
        </div>
      ) : null}
      {sheet}
    </>
  );
}
