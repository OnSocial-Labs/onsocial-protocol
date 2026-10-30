'use client';

import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  PortfolioWritingList,
  type PortfolioWritingPanelProps,
} from '@/components/portfolio/portfolio-writing-list';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useSearchDraft } from '@/hooks/use-search-draft';
import {
  articleMatchesQuery,
  resolveWritingListQuery,
  resolveWritingShelfCount,
  shouldShowWritingSearch,
} from '@/lib/article-post-payload';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  endPortfolioShelfHop,
  markWritingShelfArrived,
} from '@/lib/portfolio-shelf-hop';
import { consumeEssayReopen } from '@/lib/essay-return';
import { postKey } from '@/lib/post-display';
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

export type { PortfolioWritingPanelProps };

function useWritingShelfState(articleCount: number) {
  const search = useSearchDraft('');
  const query = search.draft;
  /* Heading stays live. Cards use the trimmed text after a short pause. */
  const listQuery = resolveWritingListQuery(query, search.committed);
  const showSearch = shouldShowWritingSearch(articleCount);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  return { query, search, listQuery, showSearch, scrollRootRef };
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
  const [liveHints, setLiveHints] = useState<
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
    () => ({ ...liveHints, ...panel.coverHints, ...moreHints }),
    [liveHints, moreHints, panel.coverHints]
  );

  const { query, search, listQuery, showSearch, scrollRootRef } =
    useWritingShelfState(articles.length);

  const [openPost, setOpenPost] = useState<PostRow | null>(null);

  useEffect(() => {
    setMoreArticles([]);
    setMoreHints({});
    setLiveHints({});
    setNextOffset(panel.articleNextOffset ?? null);
    setMoreFailed(false);
  }, [panel.accountId, panel.articleNextOffset]);

  useEffect(() => {
    if (panel.articles.length === 0) return;
    let cancelled = false;
    const os = createReadOnlyOnSocialClient();
    void hydrateWritingArticleCovers(panel.articles, os)
      .then((hints) => {
        if (!cancelled) setLiveHints((current) => ({ ...current, ...hints }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [panel.accountId, panel.articles]);

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
          <WritingSearchHeading
            query={query}
            onQueryChange={search.setDraft}
            onFocus={search.onFocus}
            onBlur={search.onBlur}
          />
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
        <PortfolioPersonalComposer
          pageAccountId={panel.accountId}
          dockPen="article"
        />
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
    markWritingShelfArrived();
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
