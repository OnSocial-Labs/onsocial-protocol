'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { PostRow, ReposterRow } from '@onsocial/sdk';
import { Divider, RepeatIcon } from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
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
import { GUILDS_PAGE_CLASS } from '@/lib/os-chrome-page';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { OsLoadMore } from '@/lib/os-load-more';
import { fetchIndexedPost } from '@/lib/fetch-personal-post';
import {
  POST_QUOTES_PAGE_SIZE,
  POST_REPOSTERS_PAGE_SIZE,
  type PostQuotesPageData,
} from '@/lib/load-post-quotes-page';
import { usePostQuotesTrackHost } from '@/features/home/post-quotes-track-host';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveQuotedInset } from '@/lib/post-relation';
import { displayName } from '@/lib/profile-display';
import { POST_REACH_TITLE } from '@/lib/post-reach-title';
import { postThreadPath, type PostQuotesTab } from '@/lib/post-routes';
import { planThreadLoad } from '@/lib/thread-open';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type QuotesTab = PostQuotesTab;

interface PostQuotesPanelProps {
  author: string;
  postId: string;
  initial?: PostQuotesPageData | null;
  /** Inside the post sheet — the sheet header owns Back. */
  embedded?: boolean;
  /** Reposts-only rows open this screen already on Reposts. */
  initialTab?: QuotesTab;
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
  embedded = false,
  initialTab = 'quotes',
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
  const [activeTab, setActiveTab] = useState<QuotesTab>(
    initialTab === 'reposts' ? 'reposts' : 'quotes'
  );
  const pinRepostsRef = useRef(initialTab === 'reposts');
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

  const paintedKeyRef = useRef<string | null>(
    initial ? `${author}/${postId}` : null
  );

  useEffect(() => {
    let cancelled = false;
    const key = `${author}/${postId}`;
    // One load per setup. A second effect pass must not blank a painted card.
    queueMicrotask(() => {
      if (cancelled) return;
      const plan = planThreadLoad(paintedKeyRef.current, key);
      paintedKeyRef.current = plan.paintedKey;
      void refresh({ background: plan.background });
    });
    return () => {
      cancelled = true;
    };
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
  const trackHost = usePostQuotesTrackHost();
  const pagerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const settledRef = useRef<QuotesTab>(activeTab);

  const placeThumb = useCallback(() => {
    const pager = pagerRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;
    const buttons = [...track.querySelectorAll<HTMLElement>('[role="tab"]')];
    const first = buttons[0];
    const second = buttons[1];
    if (!first || !second) return;
    const width = pager?.clientWidth ?? 0;
    const progress =
      width > 0
        ? Math.min(1, Math.max(0, (pager?.scrollLeft ?? 0) / width))
        : activeTab === 'reposts'
          ? 1
          : 0;
    const left =
      first.offsetLeft + (second.offsetLeft - first.offsetLeft) * progress;
    const buttonWidth =
      first.offsetWidth + (second.offsetWidth - first.offsetWidth) * progress;
    thumb.style.width = `${buttonWidth}px`;
    thumb.style.height = `${first.offsetHeight}px`;
    thumb.style.transform = `translate3d(${left}px, ${first.offsetTop}px, 0)`;
  }, [activeTab]);

  useLayoutEffect(() => {
    if (loadState !== 'ready') return;
    const sync = () => {
      const pager = pagerRef.current;
      if (pinRepostsRef.current && pager && pager.clientWidth > 0) {
        pager.scrollLeft = pager.clientWidth;
        settledRef.current = 'reposts';
        pinRepostsRef.current = false;
      }
      placeThumb();
    };
    sync();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => sync());
    observer.observe(track);
    const pager = pagerRef.current;
    if (pager) observer.observe(pager);
    return () => observer.disconnect();
  }, [loadState, placeThumb, quoteTotal, repostTotal, trackHost]);

  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager || loadState !== 'ready') return;
    const onScroll = () => {
      placeThumb();
      if (pager.clientWidth <= 0) return;
      const next: QuotesTab =
        pager.scrollLeft / pager.clientWidth > 0.5 ? 'reposts' : 'quotes';
      if (settledRef.current === next) return;
      settledRef.current = next;
      setActiveTab(next);
    };
    pager.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', placeThumb);
    return () => {
      pager.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', placeThumb);
    };
  }, [loadState, placeThumb]);

  const selectTab = (tab: QuotesTab) => {
    settledRef.current = tab;
    setActiveTab(tab);
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth <= 0) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    pager.scrollTo({
      left: (tab === 'reposts' ? 1 : 0) * pager.clientWidth,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  const track = (
    <div
      ref={trackRef}
      className="app-storage-mode-toggle post-quotes-track"
      role="tablist"
      aria-label="Quotes and reposts"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        selectTab(event.key === 'ArrowRight' ? 'reposts' : 'quotes');
      }}
    >
      <span ref={thumbRef} className="post-quotes-track-thumb" aria-hidden />
      <button
        type="button"
        role="tab"
        id="post-quotes-tab-quotes"
        aria-controls="post-quotes-page-quotes"
        aria-selected={activeTab === 'quotes'}
        tabIndex={activeTab === 'quotes' ? 0 : -1}
        className={`app-storage-mode${activeTab === 'quotes' ? ' is-active' : ''}`}
        onClick={() => selectTab('quotes')}
      >
        Quotes
        <span className="app-storage-mode-count">{quoteTotal}</span>
      </button>
      <button
        type="button"
        role="tab"
        id="post-quotes-tab-reposts"
        aria-controls="post-quotes-page-reposts"
        aria-selected={activeTab === 'reposts'}
        tabIndex={activeTab === 'reposts' ? 0 : -1}
        className={`app-storage-mode${activeTab === 'reposts' ? ' is-active' : ''}`}
        onClick={() => selectTab('reposts')}
      >
        Reposts
        <span className="app-storage-mode-count">{repostTotal}</span>
      </button>
    </div>
  );

  const body = (
    <div
      className={
        loadState === 'ready' && root
          ? 'post-quotes-screen'
          : `${GUILDS_PAGE_CLASS} post-quotes-screen`
      }
    >
      {loadState === 'loading' ? <PostRowSkeleton rows={4} /> : null}

      {loadState === 'missing' ? (
        <section className="guild-state-card">
          <p>We could not find this post in the indexed feed yet.</p>
          <OsEmptyAction onClick={() => void refresh()}>Retry</OsEmptyAction>
        </section>
      ) : null}

      {loadState === 'error' ? (
        <section className="guild-state-card is-error">
          <p>{error ?? 'Could not load quotes.'}</p>
          <OsEmptyAction onClick={() => void refresh()}>Retry</OsEmptyAction>
        </section>
      ) : null}

      {loadState === 'ready' && root ? (
        <div ref={pagerRef} className="post-quotes-pager">
          <div
            id="post-quotes-page-quotes"
            className="post-quotes-page"
            role="tabpanel"
            aria-labelledby="post-quotes-tab-quotes"
            aria-hidden={activeTab !== 'quotes'}
            inert={activeTab !== 'quotes'}
          >
            <div className={`${GUILDS_PAGE_CLASS} post-quotes-page-scroll`}>
              {quotes.length > 0 ? (
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
                        quotedHref={quoted ? postThreadPath(quoted) : undefined}
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
              )}
              {hasMoreQuotes ? (
                <OsLoadMore
                  onClick={() => void loadMore('quotes')}
                  pending={loadingMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Show more quotes'}
                </OsLoadMore>
              ) : null}
            </div>
          </div>
          <div
            id="post-quotes-page-reposts"
            className="post-quotes-page"
            role="tabpanel"
            aria-labelledby="post-quotes-tab-reposts"
            aria-hidden={activeTab !== 'reposts'}
            inert={activeTab !== 'reposts'}
          >
            <div className={`${GUILDS_PAGE_CLASS} post-quotes-page-scroll`}>
              {reposters.length > 0 ? (
                reposters.map((row, index) => {
                  const profile = postAuthorProfiles[row.accountId];
                  const name = displayName(row.accountId, profile?.displayName);
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
                        <AccountAvatar
                          accountId={row.accountId}
                          kind={profile?.kind}
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
              {hasMoreReposters ? (
                <OsLoadMore
                  onClick={() => void loadMore('reposts')}
                  pending={loadingMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Show more reposts'}
                </OsLoadMore>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const trackNode =
    loadState === 'ready' && root
      ? embedded
        ? trackHost
          ? createPortal(track, trackHost)
          : null
        : null
      : null;

  if (embedded) {
    return (
      <>
        {trackNode}
        {body}
      </>
    );
  }

  return (
    <OsAppScreen
      title={POST_REACH_TITLE}
      compactChrome
      dockBack
      glassChrome
      nestedScrollChrome
      className="post-quotes-screen-chrome"
      toolbar={loadState === 'ready' && root ? track : undefined}
      backFallbackHref={backHref}
    >
      {body}
    </OsAppScreen>
  );
}
