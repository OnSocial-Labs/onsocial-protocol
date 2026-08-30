'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { PostRow, ReposterRow } from '@onsocial/sdk';
import { Divider, ProfileAvatar, RepeatIcon } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { PostCard, PostRowSkeleton, postKey } from '@/features/home/post-card';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchIndexedPost } from '@/lib/fetch-personal-post';
import {
  POST_QUOTES_PAGE_SIZE,
  POST_REPOSTERS_PAGE_SIZE,
  type PostQuotesPageData,
} from '@/lib/load-post-quotes-page';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveQuotedInset } from '@/lib/post-relation';
import { postThreadPath } from '@/lib/post-routes';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type QuotesTab = 'quotes' | 'reposts';

interface PostQuotesPanelProps {
  author: string;
  postId: string;
  initial?: PostQuotesPageData | null;
}

function contentPathFor(root: PostRow): string {
  return root.groupId
    ? `${root.accountId}/groups/${root.groupId}/content/post/${root.postId}`
    : `${root.accountId}/post/${root.postId}`;
}

/** Quotes + reposts screen — amplification lives here, off the thread. */
export function PostQuotesPanel({
  author,
  postId,
  initial = null,
}: PostQuotesPanelProps) {
  seedScarceEmbedsFromSsr(initial?.scarceEmbeds);
  const { setTxResult } = useAppTransactionFeedback();
  const [loadState, setLoadState] = useState<LoadState>(() =>
    initial ? 'ready' : 'loading'
  );
  const [root, setRoot] = useState<PostRow | null>(() => initial?.root ?? null);
  const [quotes, setQuotes] = useState<PostRow[]>(() => initial?.quotes ?? []);
  const [reposters, setReposters] = useState<ReposterRow[]>(
    () => initial?.reposters ?? []
  );
  const [hasMoreQuotes, setHasMoreQuotes] = useState(
    () => initial?.hasMoreQuotes ?? false
  );
  const [hasMoreReposters, setHasMoreReposters] = useState(
    () => initial?.hasMoreReposters ?? false
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<QuotesTab>('quotes');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (options: { background?: boolean } = {}) => {
      if (!options.background) {
        setLoadState('loading');
        setError(null);
      }
      try {
        const client = createReadOnlyOnSocialClient();
        const fetchedRoot = await fetchIndexedPost({ author, postId });
        if (options.background && !fetchedRoot) return;
        if (!fetchedRoot) {
          setLoadState('missing');
          return;
        }
        const path = contentPathFor(fetchedRoot);
        const [quotesResult, repostersResult] = await Promise.allSettled([
          client.query.threads.quotesByPath(path, {
            limit: POST_QUOTES_PAGE_SIZE,
            order: 'desc',
          }),
          client.query.threads.repostersByPath(path, {
            limit: POST_REPOSTERS_PAGE_SIZE,
          }),
        ]);
        const fetchedQuotes =
          quotesResult.status === 'fulfilled' ? quotesResult.value : [];
        const fetchedReposters =
          repostersResult.status === 'fulfilled' ? repostersResult.value : [];
        setRoot(fetchedRoot);
        setQuotes(fetchedQuotes);
        setReposters(fetchedReposters);
        setHasMoreQuotes(fetchedQuotes.length >= POST_QUOTES_PAGE_SIZE);
        setHasMoreReposters(
          fetchedReposters.length >= POST_REPOSTERS_PAGE_SIZE
        );
        if (!options.background) setLoadState('ready');
      } catch (cause) {
        if (options.background) return;
        setLoadState('error');
        setError(
          cause instanceof Error ? cause.message : 'Could not load quotes.'
        );
      }
    },
    [author, postId]
  );

  const ssrSeedRef = useRef(Boolean(initial));

  useEffect(() => {
    if (ssrSeedRef.current) {
      ssrSeedRef.current = false;
      void refresh({ background: true });
      return;
    }
    void refresh();
  }, [author, postId, refresh]);

  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    if (root) ids.add(root.accountId);
    for (const quote of quotes) ids.add(quote.accountId);
    for (const row of reposters) ids.add(row.accountId);
    return Array.from(ids);
  }, [root, quotes, reposters]);
  const postAuthorProfiles = usePostAuthorProfiles(profileIds);

  const engagementPosts = useMemo(
    () => [...(root ? [root] : []), ...quotes],
    [root, quotes]
  );
  const {
    engagement,
    toggleReaction,
    toggleSave,
    isReactionPending,
    isSavePending,
  } = usePostEngagement(engagementPosts, {
    initial: initial?.engagement ?? null,
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    engagementPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

  const loadMore = useCallback(
    async (tab: QuotesTab) => {
      if (loadingMore || !root) return;
      setLoadingMore(true);
      try {
        const client = createReadOnlyOnSocialClient();
        const path = contentPathFor(root);
        if (tab === 'quotes') {
          const page = await client.query.threads.quotesByPath(path, {
            limit: POST_QUOTES_PAGE_SIZE,
            offset: quotes.length,
            order: 'desc',
          });
          setQuotes((current) => [...current, ...page]);
          setHasMoreQuotes(page.length >= POST_QUOTES_PAGE_SIZE);
        } else {
          const page = await client.query.threads.repostersByPath(path, {
            limit: POST_REPOSTERS_PAGE_SIZE,
            offset: reposters.length,
          });
          setReposters((current) => [...current, ...page]);
          setHasMoreReposters(page.length >= POST_REPOSTERS_PAGE_SIZE);
        }
      } catch {
        // Keep the current list; the button stays available to retry.
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore, root, quotes.length, reposters.length]
  );

  const backHref = root
    ? postThreadPath(root)
    : postThreadPath({ accountId: author, postId });

  // Indexer totals for tab counts — loaded arrays are page-limited.
  const rootEngagement = root ? engagement[postKey(root)] : undefined;
  const quoteTotal = Math.max(rootEngagement?.quoteCount ?? 0, quotes.length);
  const repostTotal = Math.max(
    rootEngagement?.repostCount ?? 0,
    reposters.length
  );

  return (
    <OsAppScreen
      title="Quotes"
      compactChrome
      dockBack
      glassChrome
      backFallbackHref={backHref}
    >
      <div className="guilds-page">
        {loadState === 'loading' ? <PostRowSkeleton rows={4} /> : null}

        {loadState === 'missing' ? (
          <section className="guild-state-card">
            <p>We could not find this post in the indexed feed yet.</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'error' ? (
          <section className="guild-state-card is-error">
            <p>{error ?? 'Could not load quotes.'}</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'ready' && root ? (
          <section className="guild-thread-column">
            <div className="guild-thread-chrome">
              <div
                className="guild-thread-tabs"
                role="tablist"
                aria-label="Quotes and reposts"
              >
                <button
                  type="button"
                  role="tab"
                  id="post-quotes-tab-quotes"
                  aria-controls="post-quotes-panel"
                  aria-selected={activeTab === 'quotes'}
                  className={activeTab === 'quotes' ? 'is-active' : undefined}
                  onClick={() => setActiveTab('quotes')}
                >
                  Quotes
                  <span className="guild-thread-tab-count">{quoteTotal}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="post-quotes-tab-reposts"
                  aria-controls="post-quotes-panel"
                  aria-selected={activeTab === 'reposts'}
                  className={activeTab === 'reposts' ? 'is-active' : undefined}
                  onClick={() => setActiveTab('reposts')}
                >
                  Reposts
                  <span className="guild-thread-tab-count">{repostTotal}</span>
                </button>
              </div>
            </div>

            <div
              id="post-quotes-panel"
              className="guild-connected-stack"
              role="tabpanel"
              aria-labelledby={
                activeTab === 'quotes'
                  ? 'post-quotes-tab-quotes'
                  : 'post-quotes-tab-reposts'
              }
            >
              {activeTab === 'quotes' ? (
                quotes.length > 0 ? (
                  quotes.map((quote, index) => {
                    const quoted = resolveQuotedInset(quote, {}, root);
                    return (
                      <div key={postKey(quote)}>
                        <Divider
                          variant="item"
                          className={
                            index > 0
                              ? 'post-row-divider'
                              : 'post-row-divider post-row-divider--leading-hidden'
                          }
                        />
                        <PostCard
                          post={quote}
                          authorProfile={postAuthorProfiles[quote.accountId]}
                          actionHref={postThreadPath(quote)}
                          showRelationBadge={false}
                          quotedPost={quoted}
                          quotedAuthorProfile={
                            quoted
                              ? postAuthorProfiles[quoted.accountId]
                              : undefined
                          }
                          quotedHref={
                            quoted ? postThreadPath(quoted) : undefined
                          }
                          engagement={
                            engagement[postKey(quote)] ?? EMPTY_POST_ENGAGEMENT
                          }
                          reactionPending={isReactionPending(quote)}
                          savePending={isSavePending(quote)}
                          onToggleReaction={toggleReaction}
                          onToggleSave={toggleSave}
                          pollTally={pollTallyFor(quote)}
                          pollVotePending={isPollVotePending(quote)}
                          onPollVote={(post, optionIndex) => {
                            void castVote(post, optionIndex);
                          }}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="guild-state-card">No quotes yet.</div>
                )
              ) : reposters.length > 0 ? (
                reposters.map((row, index) => {
                  const profile = postAuthorProfiles[row.accountId];
                  const name =
                    profile?.displayName?.trim() || `@${row.accountId}`;
                  return (
                    <div key={`${row.accountId}:${row.repostId}`}>
                      {index > 0 ? (
                        <Divider variant="item" className="post-row-divider" />
                      ) : null}
                      <Link
                        href={portfolioPath(row.accountId)}
                        className="post-quotes-repost-row"
                        scroll={false}
                      >
                        <ProfileAvatar
                          src={profile?.avatarUrl ?? null}
                          fallbackInitial={name}
                          size="lg"
                          className="post-card-avatar"
                        />
                        <PostIdentityMeta
                          name={name}
                          accountId={row.accountId}
                          timestamp={row.blockTimestamp}
                        />
                        <RepeatIcon
                          className="post-quotes-repost-row-icon"
                          aria-hidden
                        />
                      </Link>
                    </div>
                  );
                })
              ) : (
                <div className="guild-state-card">No reposts yet.</div>
              )}

              {(activeTab === 'quotes' && hasMoreQuotes) ||
              (activeTab === 'reposts' && hasMoreReposters) ? (
                <button
                  type="button"
                  className="guild-load-more"
                  disabled={loadingMore}
                  onClick={() => void loadMore(activeTab)}
                >
                  {loadingMore
                    ? 'Loading…'
                    : activeTab === 'quotes'
                      ? 'Show more quotes'
                      : 'Show more reposts'}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
