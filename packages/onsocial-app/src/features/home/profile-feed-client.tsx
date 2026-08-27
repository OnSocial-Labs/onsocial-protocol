'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PersonalFeedList,
  insertOptimisticFeedPost,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { PostRowSkeleton } from '@/features/home/post-card';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { postKey } from '@/lib/post-display';
import {
  parsePostMedia,
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
  const [posts, setPosts] = useState(initialPosts);
  const postsRef = useRef(posts);
  const total = Math.max(postCount, posts.length);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  // Per-tab top-up: the SSR seed is only the newest ~24 posts overall, so a
  // section can look empty even when older rows exist. Fetch each section
  // once on first view and merge into the pool.
  const fetchedTabsRef = useRef<Set<ProfileFeedTab>>(new Set());
  const [pendingTab, setPendingTab] = useState<ProfileFeedTab | null>(null);

  useEffect(() => {
    if (!tab || fetchedTabsRef.current.has(tab)) return;
    fetchedTabsRef.current.add(tab);
    const requested = tab;
    queueMicrotask(() => {
      setPendingTab(requested);
    });
    const client = createReadOnlyOnSocialClient();
    // Media has no indexed column — widen the window and filter client-side.
    const request =
      tab === 'media'
        ? client.query.feed.recent({ author: accountId, limit: 72 })
        : client.query.feed.recent({
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
    (post: PostRow) => {
      if (post.accountId !== accountId) return;
      if (!shouldPrependOptimisticFeedPost(post)) return;
      setPosts((current) => insertOptimisticFeedPost(current, post));
    },
    [accountId]
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

  const { openReply, openFullReply, openQuote, openRepost, openUndoRepost, sheet } =
    usePersonalComposer({
      registerPen: false,
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
    return posts.filter((post) => parsePostMedia(post.value).length > 0);
  }, [posts, tab]);

  if (visiblePosts.length === 0) {
    // Don't claim "No replies yet" while the section fetch is in flight.
    if (tab && pendingTab === tab) {
      return (
        <div className="panel-body">
          <PostRowSkeleton rows={3} />
          {sheet}
        </div>
      );
    }
    return (
      <div className="panel-body">
        {/* Tabs already name the section — lead line only on the legacy page. */}
        {!tab ? (
          <p className="panel-lead">
            Public posts from <strong>@{accountId}</strong>.
          </p>
        ) : null}
        <div className="panel-placeholder">
          <span className="panel-placeholder-label">
            {tab
              ? FEED_TAB_EMPTY[tab]
              : total > 0
                ? `${total} indexed`
                : 'No posts yet'}
          </span>
          <p>
            {tab
              ? isOwner
                ? FEED_TAB_OWNER_HINT[tab]
                : 'Nothing here yet.'
              : total > 0
                ? 'Indexed posts could not be loaded right now.'
                : isOwner
                  ? 'Nothing published yet. Use the pen to post.'
                  : 'Nothing published yet.'}
          </p>
        </div>
        {sheet}
      </div>
    );
  }

  return (
    <div className="panel-body">
      {!tab ? (
        <p className="panel-lead">
          Public posts from <strong>@{accountId}</strong>
          {total > posts.length ? ` · showing ${posts.length}` : null}.
        </p>
      ) : null}
      <PersonalFeedList
        posts={visiblePosts}
        includeForeignReplies={tab === 'replies'}
        onReply={replyHandler}
        onExpandReply={openFullReply}
        onQuote={quoteHandler}
        onRepost={repostHandler}
        onUndoRepost={undoRepostHandler}
        className="home-feed-list profile-feed-list"
      />
      {sheet}
    </div>
  );
}
