'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon } from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  DISCOVER_ARTICLE_PAGE,
  searchDiscoverArticles,
  type DiscoverCatalogArticle,
} from '@/features/discover/discover-catalog-search';
import type { ArticleSearchCursor } from '@/features/discover/discover-catalog';
import { writingArticlePath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';

function faceInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

/**
 * The rest of a Discover article search. A row opens the reader over this
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
  const [rows, setRows] = useState<DiscoverCatalogArticle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setRows([]);
      setHasMore(false);
      setLoading(true);
      void searchDiscoverArticles(query, { limit: DISCOVER_ARTICLE_PAGE })
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
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  const loadMore = () => {
    const last = rows[rows.length - 1];
    if (!last || loadingMore) return;
    const before: ArticleSearchCursor = {
      blockHeight: last.blockHeight,
      postId: last.postId,
    };
    setLoadingMore(true);
    void searchDiscoverArticles(query, {
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
      subtitle={query.trim()}
      closeAriaLabel="Back"
      closeIcon={<ChevronLeftIcon className="glass-sheet-close-icon" />}
      zIndex={SHEET_Z.discover}
      contentClassName="discover-articles-list"
    >
      {loading ? <MarketListSkeleton rows={4} /> : null}
      {!loading && rows.length === 0 ? (
        <p className="market-section-title">Nothing matches.</p>
      ) : null}
      <div role="list">
        {rows.map((article) => (
          <Link
            key={`${article.accountId}/${article.postId}`}
            href={writingArticlePath(article.accountId, article.postId)}
            scroll={false}
            className="market-listing-row discover-catalog-row discover-catalog-row--face"
            aria-label={article.title}
            onClick={(event) => openRow(article, event)}
          >
            <AccountAvatar
              accountId={article.accountId}
              fallbackInitial={faceInitial(article.title)}
              size="lg"
            />
            <div className="market-listing-copy">
              <span className="market-listing-title">{article.title}</span>
              <p className="drops-discovery-deal">{article.accountId}</p>
            </div>
          </Link>
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
