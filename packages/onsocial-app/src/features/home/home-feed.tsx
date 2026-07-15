'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HomeFeedLensMenu } from '@/features/home/home-feed-lens-menu';
import {
  homeFeedLensEmptyCopy,
  homeFeedLensSubtitle,
  readStoredHomeFeedLens,
  resolveHomeFeedLens,
  writeStoredHomeFeedLens,
  type HomeFeedLens,
} from '@/features/home/home-feed-lens';
import { HomeHashtagSearch } from '@/features/home/home-hashtag-search-field';
import {
  homeHashtagEmptyCopy,
  homeHashtagSubtitle,
} from '@/features/home/home-hashtag-search';
import {
  PersonalFeedList,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { revokeDroppedOptimisticMedia } from '@/lib/post-media';

async function loadHomeFeed(
  lens: HomeFeedLens,
  accountId: string | null
): Promise<PostRow[]> {
  const client = createReadOnlyOnSocialClient();

  if (lens === 'standing' && accountId) {
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

    return [];
  }

  const page = await client.query.feed.recent({ limit: 24 });
  return page.items;
}

async function loadHashtagFeed(tag: string): Promise<PostRow[]> {
  const client = createReadOnlyOnSocialClient();
  const page = await client.query.feed.byHashtag(tag, { limit: 24 });
  return page.items;
}

export function HomePagePanel() {
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
  } = useAppWallet();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<HomeFeedLens>('global');
  const [lensReady, setLensReady] = useState(false);
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);

  useEffect(() => {
    if (walletLoading) return;
    setLens(readStoredHomeFeedLens(isConnected));
    setLensReady(true);
  }, [isConnected, walletLoading]);

  const activeLens = resolveHomeFeedLens(lens, isConnected);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const items = activeHashtag
        ? await loadHashtagFeed(activeHashtag)
        : await loadHomeFeed(activeLens, accountId);
      setPosts((current) => {
        revokeDroppedOptimisticMedia(current, items);
        return items;
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not load feed.';
      setError(message);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, activeHashtag, activeLens]);

  useEffect(() => {
    if (walletLoading || !lensReady) {
      return;
    }

    void refresh();
  }, [refresh, walletLoading, lensReady]);

  const clearHashtagSearch = useCallback(() => {
    setHashtagQuery('');
    setActiveHashtag(null);
  }, []);

  const handleLensChange = useCallback(
    (next: HomeFeedLens) => {
      const resolved = resolveHomeFeedLens(next, isConnected);
      setLens(resolved);
      writeStoredHomeFeedLens(resolved);
      clearHashtagSearch();
    },
    [clearHashtagSearch, isConnected]
  );

  const handleCommitHashtag = useCallback((tag: string) => {
    setHashtagQuery(`#${tag}`);
    setActiveHashtag(tag);
  }, []);

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

  const subtitle = activeHashtag
    ? homeHashtagSubtitle(activeHashtag)
    : homeFeedLensSubtitle(activeLens);

  const emptyCopy = activeHashtag
    ? homeHashtagEmptyCopy(activeHashtag)
    : homeFeedLensEmptyCopy(activeLens);

  return (
    <OsAppScreen
      title="Home"
      subtitle={subtitle}
      backFallbackHref="/"
      toolbar={
        <div className="home-feed-toolbar">
          <HomeFeedLensMenu
            lens={activeLens}
            onLensChange={handleLensChange}
            standingAvailable={isConnected}
          />
          <HomeHashtagSearch
            query={hashtagQuery}
            onQueryChange={setHashtagQuery}
            activeTag={activeHashtag}
            onCommitTag={handleCommitHashtag}
            onClear={clearHashtagSearch}
          />
        </div>
      }
    >
      <div className="home-feed">
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
          <div className="home-feed-state">{emptyCopy}</div>
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
    </OsAppScreen>
  );
}

/** @deprecated Prefer `HomePagePanel`. */
export const HomeFeed = HomePagePanel;
