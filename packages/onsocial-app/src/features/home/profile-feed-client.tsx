'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PersonalFeedList,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { accountIdsEqual } from '@/lib/account-match';
import { revokeOptimisticMediaPreviewUrls } from '@/lib/post-media';

interface ProfileFeedClientProps {
  accountId: string;
  posts?: PostRow[];
  postCount?: number;
}

/**
 * Interactive profile feed — thread blocks + reply/quote. Owner pen stays on
 * the portfolio dock (`PortfolioPersonalComposer`).
 */
export function ProfileFeedClient({
  accountId,
  posts: initialPosts = [],
  postCount = 0,
}: ProfileFeedClientProps) {
  const { accountId: viewerId, isConnected } = useAppWallet();
  const [posts, setPosts] = useState(initialPosts);
  const postsRef = useRef(posts);
  const total = Math.max(postCount, posts.length);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    return () => {
      for (const post of postsRef.current) {
        revokeOptimisticMediaPreviewUrls(post.value);
      }
    };
  }, []);

  const isOwner =
    isConnected &&
    Boolean(viewerId) &&
    accountIdsEqual(viewerId!, accountId);

  const destinationLabel = useMemo(
    () => `@${accountId} · Public`,
    [accountId]
  );

  const onConfirmed = useCallback(
    (post: PostRow) => {
      if (post.accountId !== accountId) return;
      if (!shouldPrependOptimisticFeedPost(post)) return;
      setPosts((current) => [post, ...current]);
    },
    [accountId]
  );

  const { openReply, openQuote, sheet } = usePersonalComposer({
    registerPen: false,
    destinationLabel,
    onConfirmed,
  });

  const replyHandler = isConnected ? openReply : undefined;
  const quoteHandler = isConnected ? openQuote : undefined;

  if (posts.length === 0) {
    return (
      <div className="panel-body">
        <p className="panel-lead">
          Public posts from <strong>@{accountId}</strong>.
        </p>
        <div className="panel-placeholder">
          <span className="panel-placeholder-label">
            {total > 0 ? `${total} indexed` : 'No posts yet'}
          </span>
          <p>
            {total > 0
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
      <p className="panel-lead">
        Public posts from <strong>@{accountId}</strong>
        {total > posts.length ? ` · showing ${posts.length}` : null}.
      </p>
      <PersonalFeedList
        posts={posts}
        onReply={replyHandler}
        onQuote={quoteHandler}
        className="home-feed-list profile-feed-list"
      />
      {sheet}
    </div>
  );
}
