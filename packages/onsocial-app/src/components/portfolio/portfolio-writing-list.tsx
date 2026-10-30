'use client';

import { memo, useMemo, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { PostRichText } from '@/features/home/post-rich-text';
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
} from '@/lib/article-post-payload';
import { accountIdsEqual } from '@/lib/account-match';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { writingArticlePath } from '@/lib/overlay-routes';
import { rememberWritingShelf } from '@/lib/writing-shelf-return';
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

export type PortfolioWritingPanelProps = {
  accountId: string;
  titleLabel: string;
  avatarUrl?: string | null;
  articles: PostRow[];
  coverHints?: Record<string, WritingArticleCoverHint>;
  /** Next post offset. Null when the shelf has the last page. */
  articleNextOffset?: number | null;
};

/** The shelf inset. Cards pull 0.45rem toward this edge for the hover wash. */
export function WritingShelfFrame({
  children,
  hidden = false,
}: {
  children: ReactNode;
  hidden?: boolean;
}) {
  return (
    <article
      className="portfolio-writing portfolio-writing--list"
      aria-hidden={hidden || undefined}
    >
      {children}
    </article>
  );
}

export const PortfolioWritingList = memo(function PortfolioWritingList({
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
    <WritingShelfFrame>
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
    </WritingShelfFrame>
  );
});
