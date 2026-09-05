'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { osFieldBorderedClassName } from '@onsocial/ui';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { PostRichText } from '@/features/home/post-rich-text';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useWritingComposeOpen } from '@/contexts/writing-compose-context';
import {
  articleCoverUrl,
  articleExcerpt,
  articleMatchesQuery,
  parseArticleSnapshot,
  resolveWritingEmptyState,
} from '@/lib/article-post-payload';
import { accountIdsEqual } from '@/lib/account-match';
import { writingArticlePath } from '@/lib/overlay-routes';
import { formatRelativePostTimestamp } from '@/lib/post-display';

export type PortfolioWritingPanelProps = {
  accountId: string;
  titleLabel: string;
  avatarUrl?: string | null;
  articles: PostRow[];
};

export function PortfolioWritingPanel({
  accountId,
  titleLabel,
  avatarUrl = null,
  articles,
}: PortfolioWritingPanelProps) {
  const { accountId: viewerId } = useAppWallet();
  const isOwner = Boolean(viewerId && accountIdsEqual(viewerId, accountId));
  const openPost = useWritingComposeOpen();
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => articles.filter((post) => articleMatchesQuery(post, query)),
    [articles, query]
  );
  const emptyState = resolveWritingEmptyState({
    isOwner,
    articleCount: articles.length,
    matchCount: rows.length,
    canCompose: Boolean(openPost),
  });

  return (
    <article className="portfolio-writing">
      <header className="portfolio-writing-masthead">
        <p className="portfolio-writing-kicker">Writing</p>
        <h1 className="portfolio-writing-name">{titleLabel}</h1>
        {articles.length > 0 ? (
          <label className="portfolio-writing-search">
            <span className="sr-only">Search writing</span>
            <input
              type="search"
              className={`${osFieldBorderedClassName} portfolio-writing-search-input`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles…"
              autoComplete="off"
            />
          </label>
        ) : null}
      </header>

      {emptyState ? (
        <div className="portfolio-writing-empty">
          <p>
            {emptyState === 'owner-cta' || emptyState === 'owner-copy'
              ? 'Add a title in compose to publish an article here.'
              : emptyState === 'visitor'
                ? 'No articles yet.'
                : 'No matching articles.'}
          </p>
          {emptyState === 'owner-cta' && openPost ? (
            <button
              type="button"
              className="portfolio-writing-empty-action"
              onClick={() => openPost()}
            >
              Write an article
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="portfolio-writing-list">
          {rows.map((post) => {
            const article = parseArticleSnapshot(post.value);
            if (!article) return null;
            return (
              <li key={`${post.accountId}:${post.postId}`}>
                <Link
                  href={writingArticlePath(post.accountId, post.postId)}
                  className="portfolio-writing-card"
                  scroll={false}
                >
                  <div className="portfolio-writing-cover">
                    <PortfolioWritingCover
                      title={article.title}
                      coverUrl={articleCoverUrl(post.value)}
                      accountId={post.accountId}
                      displayName={titleLabel}
                      avatarUrl={avatarUrl}
                      postId={post.postId}
                      issuedAt={
                        typeof post.blockTimestamp === 'number'
                          ? post.blockTimestamp
                          : Number(post.blockTimestamp) || 0
                      }
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
                      {formatRelativePostTimestamp(post.blockTimestamp)}
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
}
