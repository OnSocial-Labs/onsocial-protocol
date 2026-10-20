'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import {
  PageDrawerMediaGrid,
  PageDrawerMediaGridSkeleton,
  PROFILE_MEDIA_PAGE_SIZE,
  profileMediaAdvance,
} from '@/components/portfolio/page-drawer-media-grid';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { OsLoadMore } from '@/lib/os-load-more';
import {
  PersonalFeedList,
  insertOptimisticFeedPost,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { PostRowSkeleton } from '@/features/home/post-card';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { subscribePersonalReplyConfirmed } from '@/features/scarces/drop-compose-host';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { postKey } from '@/lib/post-display';
import {
  parsePostMedia,
  postVisualMedia,
  revokeOptimisticMediaPreviewUrls,
} from '@/lib/post-media';
import { isRepostRefType } from '@/lib/post-relation';

/** Profile feed sections — Posts / Replies / Reposts / Media. */
export type ProfileFeedTab = 'posts' | 'replies' | 'reposts' | 'media';

const FEED_TAB_EMPTY: Record<ProfileFeedTab, string> = {
  posts: 'No posts yet',
  replies: 'No replies yet',
  reposts: 'No reposts yet',
  media: 'No media yet',
};

const FEED_TAB_OWNER_HINT: Record<ProfileFeedTab, string> = {
  posts: 'Nothing published yet. Use the pen to post.',
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
    hasMore: false,
    started: false,
  });
  const [mediaPaging, setMediaPaging] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const mediaPagingRef = useRef(false);
  const mediaRequestRef = useRef(0);
  const mediaSentinelRef = useRef<HTMLDivElement | null>(null);
  const mediaAccountRef = useRef(accountId);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  // Per-tab top-up: the SSR seed is only the newest ~24 posts overall, so a
  // section can look empty even when older rows exist. Fetch each section
  // once on first view and merge into the pool.
  const fetchedTabsRef = useRef<Set<ProfileFeedTab>>(new Set());
  const [pendingTab, setPendingTab] = useState<ProfileFeedTab | null>(null);

  const fetchMediaPage = useCallback((offset: number) => {
    if (mediaPagingRef.current) return;
    mediaPagingRef.current = true;
    const requestId = mediaRequestRef.current;
    queueMicrotask(() => {
      setMediaPaging(true);
      if (offset === 0) setPendingTab('media');
    });
    const client = createReadOnlyOnSocialClient();
    void client.query.feed
      .recent({
        author: accountId,
        limit: PROFILE_MEDIA_PAGE_SIZE,
        offset,
      })
      .then((page) => {
        if (requestId !== mediaRequestRef.current) return;
        const seen = new Set(postsRef.current.map(postKey));
        const addedCount = page.items.filter(
          (row) => !seen.has(postKey(row))
        ).length;
        setPosts((current) => mergePostRows(current, page.items));
        setMediaFailed(false);
        const advance = profileMediaAdvance({
          offset,
          pageSize: PROFILE_MEDIA_PAGE_SIZE,
          itemCount: page.items.length,
          addedCount,
        });
        setMediaPage((current) => {
          // A repeated first window can land after paging has already moved on.
          if (addedCount <= 0 && current.nextOffset > offset) return current;
          return {
            nextOffset: advance.offset,
            hasMore: advance.hasMore,
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
  }, [accountId]);

  useEffect(() => {
    if (mediaAccountRef.current === accountId) return;
    mediaAccountRef.current = accountId;
    mediaRequestRef.current += 1;
    mediaPagingRef.current = false;
    queueMicrotask(() => {
      setMediaFailed(false);
      setMediaPaging(false);
      setMediaPage({ nextOffset: 0, hasMore: false, started: false });
    });
  }, [accountId]);

  useEffect(() => {
    if (!tab || tab === 'media' || fetchedTabsRef.current.has(tab)) return;
    fetchedTabsRef.current.add(tab);
    const requested = tab;
    queueMicrotask(() => {
      setPendingTab(requested);
    });
    const client = createReadOnlyOnSocialClient();
    const request = client.query.feed.recent({
      author: accountId,
      limit: 24,
      section: tab,
    });
    void request
      .then((page) => setPosts((current) => mergePostRows(current, page.items)))
      .catch(() => undefined)
      .finally(() =>
        setPendingTab((current) => (current === tab ? null : current))
      );
  }, [tab, accountId]);

  useEffect(() => {
    if (tab !== 'media' || mediaPage.started) return;
    fetchMediaPage(0);
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

  const mediaLooking =
    tab === 'media' &&
    visiblePosts.length === 0 &&
    mediaPage.hasMore &&
    !mediaFailed;

  const loadOlderMedia = useCallback(() => {
    if (tab !== 'media' || !mediaPage.hasMore || mediaPagingRef.current) return;
    setMediaFailed(false);
    fetchMediaPage(mediaPage.nextOffset);
  }, [tab, mediaPage.hasMore, mediaPage.nextOffset, fetchMediaPage]);

  // No covers yet — keep walking so an older photo is not reported missing.
  useEffect(() => {
    if (!mediaLooking || mediaPaging) return;
    fetchMediaPage(mediaPage.nextOffset);
  }, [mediaLooking, mediaPaging, mediaPage.nextOffset, fetchMediaPage]);

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

  const emptyTitle = tab
    ? FEED_TAB_EMPTY[tab]
    : total > 0
      ? `${total} indexed`
      : 'No posts yet';
  const emptyHint = tab
    ? isOwner
      ? FEED_TAB_OWNER_HINT[tab]
      : 'Nothing here yet.'
    : total > 0
      ? 'Indexed posts could not be loaded right now.'
      : isOwner
        ? 'Nothing published yet. Use the pen to post.'
        : 'Nothing published yet.';

  if (visiblePosts.length === 0) {
    // Don't claim "No replies yet" while the section fetch is in flight.
    if (
      (tab && pendingTab === tab) ||
      mediaLooking ||
      (tab === 'media' && mediaPaging && visiblePosts.length === 0)
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
          <div className="home-feed-state">
            <span>{emptyTitle}</span>
            <span>{emptyHint}</span>
          </div>
          <OsLoadMore onClick={loadOlderMedia} pending={mediaPaging}>
            Show earlier
          </OsLoadMore>
          {sheet}
        </>
      );
    }
    return (
      <>
        {/* Tabs already name the section — lead line only on the legacy page. */}
        {!tab ? (
          <p className="panel-lead">
            Public posts from <strong>@{accountId}</strong>.
          </p>
        ) : null}
        <div className="home-feed-state">
          <span>{emptyTitle}</span>
          <span>{emptyHint}</span>
        </div>
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
          {mediaPaging ? <PageDrawerMediaGridSkeleton cards={2} /> : null}
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
        <PersonalFeedList
          posts={visiblePosts}
          includeForeignReplies={tab === 'replies'}
          onReply={replyHandler}
          onExpandReply={openFullReply}
          onQuote={quoteHandler}
          onRepost={repostHandler}
          onUndoRepost={undoRepostHandler}
          className="home-feed-list"
        />
      )}
      {sheet}
    </>
  );
}
