'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { PostCard, postKey } from '@/features/home/post-card';
import { PostComposer } from '@/features/home/post-composer';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { PostRow } from '@onsocial/sdk';

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
  const { accountId, isLoading: walletLoading } = useAppWallet();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<'network' | 'global'>('global');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const items = await loadHomeFeed(accountId);
      setPosts(items);
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

      <PostComposer onPosted={() => void refresh()} />

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
        <div className="home-feed-list">
          {posts.map((post) => (
            <PostCard key={postKey(post)} post={post} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
