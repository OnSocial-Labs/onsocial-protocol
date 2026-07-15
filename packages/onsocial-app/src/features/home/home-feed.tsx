'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PersonalFeedList,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { revokeDroppedOptimisticMedia } from '@/lib/post-media';

async function loadHomeFeed(accountId: string | null): Promise<PostRow[]> {
  const client = createReadOnlyOnSocialClient();

  if (accountId) {
    const standing = await client.query.standings.outgoing(accountId, {
      limit: 48,
    });
    const sources = Array.from(new Set([accountId, ...standing]));

    if (sources.length > 0) {
      const page = await client.query.feed.fromAccounts({
        accounts: sources,
        limit: 24,
      });
      return page.items;
    }
  }

  const page = await client.query.feed.recent({ limit: 24 });
  return page.items;
}

export function HomeFeed() {
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
  } = useAppWallet();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<'network' | 'global'>('global');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const items = await loadHomeFeed(accountId);
      setPosts((current) => {
        revokeDroppedOptimisticMedia(current, items);
        return items;
      });
      setFeedMode(accountId ? 'network' : 'global');
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not load feed.';
      setError(message);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (walletLoading) {
      return;
    }

    void refresh();
  }, [refresh, walletLoading]);

  const destinationLabel = useMemo(
    () => (accountId ? `@${accountId} · Public` : 'Public'),
    [accountId]
  );

  const onConfirmed = useCallback((post: PostRow) => {
    if (!shouldPrependOptimisticFeedPost(post)) return;
    setPosts((current) => [post, ...current]);
  }, []);

  const { openReply, openQuote, sheet } = usePersonalComposer({
    registerPen: Boolean(isConnected && accountId),
    destinationLabel,
    onConfirmed,
  });

  const replyHandler = isConnected ? openReply : undefined;
  const quoteHandler = isConnected ? openQuote : undefined;

  return (
    <div className="home-feed">
      <header className="home-feed-header">
        <h1 className="home-feed-title">Home</h1>
        <p className="home-feed-subtitle">
          {feedMode === 'network'
            ? 'Posts from you and accounts you stand with.'
            : 'Recent posts across OnSocial.'}
        </p>
      </header>

      {!isConnected && !walletLoading ? (
        <section className="post-composer post-composer-guest">
          <p className="post-composer-lead">Connect your wallet to post.</p>
        </section>
      ) : null}

      {isLoading ? (
        <div className="home-feed-state">Loading feed…</div>
      ) : null}

      {!isLoading && error ? (
        <div className="home-feed-state is-error">{error}</div>
      ) : null}

      {!isLoading && !error && posts.length === 0 ? (
        <div className="home-feed-state">
          No posts yet. Be the first to share something.
        </div>
      ) : null}

      {!isLoading && !error && posts.length > 0 ? (
        <PersonalFeedList
          posts={posts}
          onReply={replyHandler}
          onQuote={quoteHandler}
          onEngagementError={(message) => setError(message)}
        />
      ) : null}

      {sheet}
    </div>
  );
}
