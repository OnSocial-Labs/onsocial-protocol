'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronLeftIcon, NoteTextFillIcon } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
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
  const trimmed = draft.trim();
  const authors = usePostAuthorProfiles(rows.map((row) => row.accountId));
  const covers = useDiscoverArticleCovers(rows);

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

  const loadMore = () => {
    const last = rows[rows.length - 1];
    if (!last || loadingMore || !isDiscoverCatalogQuery(trimmed)) return;
    const before: ArticleSearchCursor = {
      blockHeight: last.blockHeight,
      postId: last.postId,
    };
    setLoadingMore(true);
    void searchDiscoverArticles(trimmed, {
      limit: DISCOVER_ARTICLE_PAGE,
      before,
    })
      .then((page) => {
        setRows((current) => [...current, ...page.items]);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        setHasMore(false);
      })
      .finally(() => {
        setLoadingMore(false);
      });
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
      <div role="list">
        {rows.map((article) => (
          <DiscoverArticleRow
            key={`${article.accountId}/${article.postId}`}
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
            onOpen={(event) => openRow(article, event)}
          />
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="os-surface-chip"
          aria-label="More articles"
          disabled={loadingMore}
          onClick={loadMore}
        >
          More
        </button>
      ) : null}
    </OsSlideOverScreen>
  );
}
