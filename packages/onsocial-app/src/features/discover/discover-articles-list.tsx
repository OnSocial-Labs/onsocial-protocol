'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { ChevronLeftIcon, NoteTextFillIcon } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { DiscoverArticleRow } from '@/features/discover/discover-article-row';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  DISCOVER_ARTICLE_PAGE,
  searchDiscoverArticles,
  type DiscoverCatalogArticle,
} from '@/features/discover/discover-catalog-search';
import {
  isDiscoverCatalogQuery,
  type ArticleSearchCursor,
} from '@/features/discover/discover-catalog';
import {
  discoverArticleCoverKey,
  useDiscoverArticleCovers,
} from '@/features/discover/use-discover-article-covers';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { SECONDARY_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';
import { SHEET_Z } from '@/lib/sheet-z';

/**
 * The rest of a Discover article search. The header is the same search field
 * as Market and Events, holding the word. A row opens the reader over this
 * list. Back returns here, then to the search.
 */
export function DiscoverArticlesList({
  query,
  open,
  onClose,
  onOpenArticle,
}: {
  query: string;
  open: boolean;
  onClose: () => void;
  onOpenArticle: (article: DiscoverCatalogArticle) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [trackedQuery, setTrackedQuery] = useState(query);
  if (query !== trackedQuery) {
    setTrackedQuery(query);
    setDraft(query);
  }
  const [rows, setRows] = useState<DiscoverCatalogArticle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const trimmed = draft.trim();
  const authors = usePostAuthorProfiles(rows.map((row) => row.accountId));
  const { covers, posts } = useDiscoverArticleCovers(rows);
  const { engagement } = usePostEngagement(posts);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowKeys = useMemo(
    () => rows.map((row) => `${row.accountId}/${row.postId}`),
    [rows]
  );
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys: rowKeys,
      hostRef: listRef,
      anchorQuery: SECONDARY_ANCHOR_QUERY,
      estimate: 112,
    });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (!isDiscoverCatalogQuery(trimmed)) {
        setRows([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      setRows([]);
      setHasMore(false);
      setLoadMoreFailed(false);
      setLoading(true);
      void searchDiscoverArticles(trimmed, { limit: DISCOVER_ARTICLE_PAGE })
        .then((page) => {
          if (cancelled) return;
          setRows(page.items);
          setHasMore(page.hasMore);
        })
        .catch(() => {
          if (!cancelled) {
            setRows([]);
            setHasMore(false);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, trimmed]);

  const loadMore = useCallback(() => {
    const last = rows[rows.length - 1];
    if (!last || loading || loadingMore || !isDiscoverCatalogQuery(trimmed)) {
      return;
    }
    const before: ArticleSearchCursor = {
      blockHeight: last.blockHeight,
      postId: last.postId,
    };
    setLoadingMore(true);
    setLoadMoreFailed(false);
    void searchDiscoverArticles(trimmed, {
      limit: DISCOVER_ARTICLE_PAGE,
      before,
    })
      .then((page) => {
        setRows((current) => [...current, ...page.items]);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        setLoadMoreFailed(true);
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [loading, loadingMore, rows, trimmed]);

  useInfiniteScrollSentinel({
    sentinelRef: loadMoreRef,
    enabled:
      open &&
      hasMore &&
      rows.length > 0 &&
      !loading &&
      !loadingMore &&
      !loadMoreFailed,
    onIntersect: loadMore,
  });

  const retryLoadMore = () => {
    loadMore();
  };

  const openRow = (
    article: DiscoverCatalogArticle,
    event: MouseEvent<HTMLAnchorElement>
  ) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onOpenArticle(article);
  };

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title="Articles"
      compactChrome
      heading={
        <OsAppChromeNavSearch
          value={draft}
          onValueChange={setDraft}
          placeholder="Search articles"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear search"
          ariaLabel="Search articles"
          idleClassName="discover-nav-search-field"
          leadingIcon={
            <NoteTextFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      closeAriaLabel="Back"
      closeIcon={<ChevronLeftIcon className="glass-sheet-close-icon" />}
      zIndex={SHEET_Z.discover}
      contentClassName="os-app-chrome-page discover-articles-list"
    >
      {loading ? <MarketListSkeleton rows={4} /> : null}
      {!loading && isDiscoverCatalogQuery(trimmed) && rows.length === 0 ? (
        <p className="market-section-title">Nothing matches.</p>
      ) : null}
      <div ref={listRef} role="list">
        {windowed && topSpacer > 0 ? (
          <div
            style={{ height: topSpacer }}
            aria-hidden="true"
            data-feed-window-spacer="top"
          />
        ) : null}
        {rows.slice(start, end).map((article) => (
          <div
            key={`${article.accountId}/${article.postId}`}
            ref={registerRow(`${article.accountId}/${article.postId}`)}
            data-secondary-key={`${article.accountId}/${article.postId}`}
          >
            <DiscoverArticleRow
              accountId={article.accountId}
              postId={article.postId}
              title={article.title}
              profileName={authors[article.accountId]?.displayName}
              avatarUrl={authors[article.accountId]?.avatarUrl}
              cover={
                covers[
                  discoverArticleCoverKey(article.accountId, article.postId)
                ]
              }
              blockTimestamp={article.blockTimestamp}
              likeCount={
                engagement[`${article.accountId}:${article.postId}`]
                  ?.reactionCount
              }
              onOpen={(event) => openRow(article, event)}
            />
          </div>
        ))}
        {windowed && bottomSpacer > 0 ? (
          <div
            style={{ height: bottomSpacer }}
            aria-hidden="true"
            data-feed-window-spacer="bottom"
          />
        ) : null}
      </div>
      {loadingMore ? <MarketListSkeleton rows={2} /> : null}
      {loadMoreFailed ? (
        <OsChromeListAlert
          message="Couldn’t load more."
          retryLabel="Retry"
          onRetry={retryLoadMore}
        />
      ) : null}
      {hasMore && !loadMoreFailed ? (
        <div
          ref={loadMoreRef}
          className="standing-panel-sentinel"
          aria-hidden
        />
      ) : null}
    </OsSlideOverScreen>
  );
}
