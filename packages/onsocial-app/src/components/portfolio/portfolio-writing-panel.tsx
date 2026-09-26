'use client';

import {
  memo,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ArticleReadOverlay } from '@/components/portfolio/article-read-screen';
import { PortfolioEssayLeave } from '@/components/portfolio/portfolio-essay-leave';
import { PortfolioPersonalComposer } from '@/components/portfolio/portfolio-personal-composer';
import {
  WritingIdentityToolbar,
  WritingSearchHeading,
} from '@/components/portfolio/portfolio-writing-chrome';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { PostRichText } from '@/features/home/post-rich-text';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useWritingComposeOpen } from '@/contexts/writing-compose-context';
import { useEssayReturnSearch } from '@/hooks/use-essay-return-search';
import {
  articleExcerpt,
  articleMatchesQuery,
  formatWritingLikeLabel,
  formatWritingReadLabel,
  parseArticleSnapshot,
  resolveArticleCover,
  resolveWritingEmptyState,
  resolveWritingListQuery,
  resolveWritingShelfCount,
  shouldShowWritingSearch,
} from '@/lib/article-post-payload';
import { accountIdsEqual } from '@/lib/account-match';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { portfolioPath, writingArticlePath } from '@/lib/overlay-routes';
import { endPortfolioShelfHop } from '@/lib/portfolio-shelf-hop';
import { rememberWritingShelf } from '@/lib/writing-shelf-return';
import { consumeEssayReopen } from '@/lib/essay-return';
import {
  formatPostTimestamp,
  formatWritingShelfTimestamp,
  parsePostText,
  postKey,
  postTimestampIso,
} from '@/lib/post-display';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';
import {
  markPortfolioClientReady,
  unmarkPortfolioClientReady,
} from '@/lib/e2e-portfolio-ready';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { hydrateWritingArticleCovers } from '@/lib/hydrate-writing-article-covers';
import {
  fetchAuthorArticleWindow,
  WRITING_SHELF_FETCH_LIMIT,
} from '@/lib/load-portfolio-writing';

export type PortfolioWritingPanelProps = {
  accountId: string;
  titleLabel: string;
  avatarUrl?: string | null;
  articles: PostRow[];
  coverHints?: Record<string, WritingArticleCoverHint>;
  /** Next post offset. Null when the shelf has the last page. */
  articleNextOffset?: number | null;
};

const PortfolioWritingList = memo(function PortfolioWritingList({
  accountId,
  titleLabel,
  avatarUrl,
  articles,
  coverHints,
  query,
  showSearch,
  onOpenArticle,
}: PortfolioWritingPanelProps & {
  query: string;
  showSearch: boolean;
  onOpenArticle: (post: PostRow) => void;
}) {
  const { accountId: viewerId } = useAppWallet();
  const returnSearch = useEssayReturnSearch();
  const isOwner = Boolean(viewerId && accountIdsEqual(viewerId, accountId));
  const openPost = useWritingComposeOpen();
  const { engagement } = usePostEngagement(articles);

  const rows = useMemo(
    () =>
      articles.filter((post) =>
        showSearch ? articleMatchesQuery(post, query) : true
      ),
    [articles, query, showSearch]
  );
  const emptyState = resolveWritingEmptyState({
    isOwner,
    articleCount: articles.length,
    matchCount: rows.length,
    canCompose: Boolean(openPost),
  });

  return (
    <article className="portfolio-writing portfolio-writing--list">
      {emptyState ? (
        <div className="portfolio-writing-empty">
          <p>
            {emptyState === 'owner-cta' || emptyState === 'owner-copy'
              ? 'Longer pieces live here.'
              : emptyState === 'visitor'
                ? 'No articles yet.'
                : 'No matching articles.'}
          </p>
          {emptyState === 'owner-cta' && openPost ? (
            <OsEmptyAction onClick={() => openPost({ article: true })}>
              Write an article
            </OsEmptyAction>
          ) : null}
        </div>
      ) : (
        <ul className="portfolio-writing-list">
          {rows.map((post) => {
            const article = parseArticleSnapshot(post.value);
            if (!article) return null;
            const hint = coverHints?.[postKey(post)];
            const cover = resolveArticleCover({
              value: post.value,
              scarceMediaUrl: hint?.mediaUrl,
              scarceCardBg: hint?.cardBg,
            });
            const issuedAt =
              typeof post.blockTimestamp === 'number'
                ? post.blockTimestamp
                : Number(post.blockTimestamp) || 0;
            const absolute = formatPostTimestamp(post.blockTimestamp);
            const iso = postTimestampIso(post.blockTimestamp);
            const readLabel = formatWritingReadLabel(parsePostText(post.value));
            const shelfTime = formatWritingShelfTimestamp(post.blockTimestamp);
            const likeLabel = formatWritingLikeLabel(
              (engagement[postKey(post)] ?? EMPTY_POST_ENGAGEMENT).reactionCount
            );
            const articleHref = withEssayReturnSearch(
              writingArticlePath(post.accountId, post.postId),
              returnSearch
            );
            const openArticle = (event: MouseEvent<HTMLAnchorElement>) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                rememberWritingShelf(accountId);
                return;
              }
              event.preventDefault();
              onOpenArticle(post);
            };
            return (
              <li key={`${post.accountId}:${post.postId}`}>
                <Link
                  href={articleHref}
                  className="portfolio-writing-card"
                  prefetch
                  aria-label={article.title}
                  onClick={openArticle}
                >
                  <div className="portfolio-writing-cover" aria-hidden>
                    <PortfolioWritingCover
                      variant="list"
                      title={article.title}
                      coverUrl={cover.coverUrl}
                      cardBg={cover.cardBg}
                      format={cover.format}
                      markShape={cover.markShape}
                      markColor={cover.markColor}
                      accountId={post.accountId}
                      displayName={titleLabel}
                      avatarUrl={avatarUrl}
                      postId={post.postId}
                      issuedAt={issuedAt}
                    />
                  </div>
                  <div className="portfolio-writing-card-copy">
                    <h2 className="portfolio-writing-card-title">
                      {article.title}
                    </h2>
                    <p className="portfolio-writing-card-excerpt">
                      <PostRichText
                        text={articleExcerpt(post.value)}
                        inlineMarks
                        emptyFallback=""
                      />
                    </p>
                    <p className="portfolio-writing-card-meta">
                      <time dateTime={iso} title={absolute}>
                        {shelfTime}
                      </time>
                      {readLabel ? (
                        <>
                          <span aria-hidden> · </span>
                          <span>{readLabel}</span>
                        </>
                      ) : null}
                      {likeLabel ? (
                        <>
                          <span aria-hidden> · </span>
                          <span>{likeLabel}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
});

function useWritingShelfState(articleCount: number) {
  const [query, setQuery] = useState('');
  /* Heading stays live; article cards wait for idle. Clear flushes immediately. */
  const deferredQuery = useDeferredValue(query);
  const listQuery = resolveWritingListQuery(query, deferredQuery);
  const showSearch = shouldShowWritingSearch(articleCount);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  return { query, setQuery, listQuery, showSearch, scrollRootRef };
}

/** One compact glass shelf — hard refresh and profile overlay share this. */
function PortfolioWritingShelf({
  mood,
  embedded = false,
  onDockBack,
  ...panel
}: PortfolioWritingPanelProps & {
  mood: ResolvedMood;
  embedded?: boolean;
  onDockBack?: () => void;
}) {
  const [moreArticles, setMoreArticles] = useState<PostRow[]>([]);
  const [moreHints, setMoreHints] = useState<
    Record<string, WritingArticleCoverHint>
  >({});
  const [nextOffset, setNextOffset] = useState<number | null>(
    panel.articleNextOffset ?? null
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const articles = useMemo(() => {
    if (moreArticles.length === 0) return panel.articles;
    const seen = new Set(
      panel.articles.map((post) => `${post.accountId}:${post.postId}`)
    );
    return [
      ...panel.articles,
      ...moreArticles.filter(
        (post) => !seen.has(`${post.accountId}:${post.postId}`)
      ),
    ];
  }, [moreArticles, panel.articles]);
  const coverHints = useMemo(
    () => ({ ...panel.coverHints, ...moreHints }),
    [moreHints, panel.coverHints]
  );

  const { query, setQuery, listQuery, showSearch, scrollRootRef } =
    useWritingShelfState(articles.length);

  const [openPost, setOpenPost] = useState<PostRow | null>(null);

  useEffect(() => {
    setMoreArticles([]);
    setMoreHints({});
    setNextOffset(panel.articleNextOffset ?? null);
    setMoreFailed(false);
  }, [panel.accountId, panel.articleNextOffset]);

  useEffect(() => {
    markPortfolioClientReady();
    return () => unmarkPortfolioClientReady();
  }, []);

  useEffect(() => {
    let match: PostRow | null = null;
    for (const post of panel.articles) {
      if (consumeEssayReopen(post.accountId, post.postId)) {
        match = post;
        break;
      }
    }
    if (!match) return;
    const id = window.setTimeout(() => setOpenPost(match), 0);
    return () => window.clearTimeout(id);
  }, [panel.articles]);
  /* Overlay: mood wash lives on the glass sheet — keep the screen clear. */
  const moodId = embedded ? null : mood.id;
  const moodStyle = embedded
    ? undefined
    : portfolioMoodShellStyle(mood.cssVars);
  const matchCount = useMemo(
    () =>
      articles.filter((post) => articleMatchesQuery(post, listQuery)).length,
    [articles, listQuery]
  );
  const shelfCount = resolveWritingShelfCount(
    articles.length,
    matchCount,
    listQuery
  );

  const loadMoreArticles = useCallback(() => {
    if (nextOffset == null || loadingMore) return;
    const offset = nextOffset;
    setLoadingMore(true);
    setMoreFailed(false);
    void (async () => {
      try {
        const os = createReadOnlyOnSocialClient();
        const page = await fetchAuthorArticleWindow(
          os,
          panel.accountId,
          offset,
          WRITING_SHELF_FETCH_LIMIT
        );
        const hints =
          page.articles.length > 0
            ? await hydrateWritingArticleCovers(page.articles, os)
            : {};
        setMoreArticles((current) => [...current, ...page.articles]);
        setMoreHints((current) => ({ ...current, ...hints }));
        setNextOffset(page.nextOffset);
      } catch {
        setMoreFailed(true);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [loadingMore, nextOffset, panel.accountId]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: nextOffset != null && !loadingMore && !moreFailed,
    onIntersect: loadMoreArticles,
  });

  return (
    <>
      <OsAppScreen
        title="Writing"
        compactChrome
        glassChrome
        scrollTuck="search"
        leading={null}
        dockBack
        onDockBack={onDockBack}
        backFallbackHref={portfolioPath(panel.accountId)}
        moodId={moodId}
        moodStyle={moodStyle}
        scrollRootRef={scrollRootRef}
        embedded={embedded}
        heading={
          <WritingSearchHeading query={query} onQueryChange={setQuery} />
        }
        toolbar={
          <WritingIdentityToolbar
            accountId={panel.accountId}
            titleLabel={panel.titleLabel}
            avatarUrl={panel.avatarUrl}
            articleCount={shelfCount}
          />
        }
      >
        <div aria-hidden className="os-chrome-glass" />
        <PortfolioPersonalComposer pageAccountId={panel.accountId} />
        <PortfolioWritingList
          {...panel}
          articles={articles}
          coverHints={coverHints}
          query={listQuery}
          showSearch={showSearch}
          onOpenArticle={setOpenPost}
        />
        {loadingMore ? (
          <div className="portfolio-writing-pending" aria-hidden>
            <span className="standing-row-shimmer portfolio-writing-pending-row" />
            <span className="standing-row-shimmer portfolio-writing-pending-row" />
          </div>
        ) : null}
        {moreFailed ? (
          <OsChromeListAlert
            message="Couldn’t load more."
            retryLabel="Retry"
            onRetry={loadMoreArticles}
          />
        ) : null}
        {nextOffset != null ? (
          <div
            ref={loadMoreRef}
            className="standing-panel-sentinel"
            aria-hidden
          />
        ) : null}
      </OsAppScreen>
      {openPost ? (
        <ArticleReadOverlay
          open
          onOpenChange={(next) => {
            if (!next) setOpenPost(null);
          }}
          onReturnToShelf={() => setOpenPost(null)}
          accountId={panel.accountId}
          titleLabel={panel.titleLabel}
          avatarUrl={panel.avatarUrl}
          post={openPost}
          coverHint={coverHints[postKey(openPost)] ?? null}
          articles={articles}
          coverHints={coverHints}
          onOpenArticle={setOpenPost}
        />
      ) : null}
    </>
  );
}

/** Hard refresh / shared Writing URL. */
export function PortfolioWritingScreen({
  mood,
  ...panel
}: PortfolioWritingPanelProps & { mood: ResolvedMood }) {
  return (
    <>
      <PortfolioWritingShelf mood={mood} {...panel} />
      <PortfolioEssayLeave accountId={panel.accountId} />
    </>
  );
}

/** Soft-nav Writing overlay — same compact chrome as hard refresh. */
export function PortfolioWritingOverlay({
  mood,
  ...panel
}: PortfolioWritingPanelProps & { mood: ResolvedMood }) {
  const dismiss = useOverlayDismiss();

  useLayoutEffect(() => {
    const hideFaceMs = 320;
    const id = window.setTimeout(() => endPortfolioShelfHop(), hideFaceMs);
    return () => {
      window.clearTimeout(id);
      if (!window.location.pathname.includes('/writing')) {
        endPortfolioShelfHop();
      }
    };
  }, []);

  return (
    <>
      <OverlayPanelChrome ariaTitle="Writing" hideTitle />
      <PortfolioWritingShelf
        mood={mood}
        embedded
        onDockBack={dismiss}
        {...panel}
      />
      <PortfolioEssayLeave accountId={panel.accountId} />
    </>
  );
}
