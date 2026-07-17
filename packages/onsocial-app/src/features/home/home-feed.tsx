'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HomeFeedLensMenu } from '@/features/home/home-feed-lens-menu';
import {
  homeFeedLensEmptyCopy,
  readStoredHomeFeedLens,
  resolveHomeFeedLens,
  writeStoredHomeFeedLens,
  type HomeFeedLens,
} from '@/features/home/home-feed-lens';
import { HomeActiveFocusProvider } from '@/features/home/home-active-hashtag';
import { HomeFeedFocusSearch } from '@/features/home/home-hashtag-search-field';
import {
  homeFeedFocusClearPath,
  homeFeedFocusEmptyCopy,
  homeFeedFocusPath,
  homeFeedFocusQueryValue,
  HOME_HASHTAG_QUERY_KEY,
  HOME_TICKER_QUERY_KEY,
  parseHomeFeedFocus,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';
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

async function loadFocusedFeed(focus: HomeFeedFocus): Promise<PostRow[]> {
  const client = createReadOnlyOnSocialClient();
  const page =
    focus.kind === 'ticker'
      ? await client.query.feed.byTicker(focus.value, { limit: 24 })
      : await client.query.feed.byHashtag(focus.value, { limit: 24 });
  return page.items;
}

export function HomePagePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const activeFocus = parseHomeFeedFocus({
    tag: searchParams.get(HOME_HASHTAG_QUERY_KEY),
    ticker: searchParams.get(HOME_TICKER_QUERY_KEY),
  });
  const [focusQuery, setFocusQuery] = useState(() =>
    homeFeedFocusQueryValue(activeFocus)
  );

  useEffect(() => {
    setFocusQuery(homeFeedFocusQueryValue(activeFocus));
  }, [activeFocus]);

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
      const items = activeFocus
        ? await loadFocusedFeed(activeFocus)
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
  }, [accountId, activeFocus, activeLens]);

  useEffect(() => {
    if (walletLoading || !lensReady) {
      return;
    }

    void refresh();
  }, [refresh, walletLoading, lensReady]);

  const clearFocusSearch = useCallback(() => {
    setFocusQuery('');
    router.replace(homeFeedFocusClearPath(), { scroll: false });
  }, [router]);

  const handleLensChange = useCallback(
    (next: HomeFeedLens) => {
      const resolved = resolveHomeFeedLens(next, isConnected);
      setLens(resolved);
      writeStoredHomeFeedLens(resolved);
      clearFocusSearch();
    },
    [clearFocusSearch, isConnected]
  );

  const handleCommitFocus = useCallback(
    (focus: HomeFeedFocus) => {
      setFocusQuery(homeFeedFocusQueryValue(focus));
      router.replace(homeFeedFocusPath(focus), { scroll: false });
    },
    [router]
  );

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

  const emptyCopy = activeFocus
    ? homeFeedFocusEmptyCopy(activeFocus)
    : homeFeedLensEmptyCopy(activeLens);

  return (
    <HomeActiveFocusProvider focus={activeFocus}>
      <OsAppScreen
        title="Home"
        backFallbackHref="/"
        toolbar={
          <div className="home-feed-toolbar">
            <HomeFeedLensMenu
              lens={activeLens}
              onLensChange={handleLensChange}
              standingAvailable={isConnected}
            />
            <HomeFeedFocusSearch
              query={focusQuery}
              onQueryChange={setFocusQuery}
              activeFocus={activeFocus}
              onCommitFocus={handleCommitFocus}
              onClear={clearFocusSearch}
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
              includeForeignReplies={Boolean(activeFocus)}
              showGuildAttribution
              onReply={replyHandler}
              onQuote={quoteHandler}
              onEngagementError={(message) => setError(message)}
            />
          ) : null}

          {sheet}
        </div>
      </OsAppScreen>
    </HomeActiveFocusProvider>
  );
}

/** @deprecated Prefer {@link HomePagePanel}. */
export const HomeFeedPanel = HomePagePanel;
