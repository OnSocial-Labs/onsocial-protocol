'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { osFieldBorderedClassName } from '@onsocial/ui';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  articleCoverUrl,
  articleExcerpt,
  articleMatchesQuery,
  parseArticleSnapshot,
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
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => articles.filter((post) => articleMatchesQuery(post, query)),
    [articles, query]
  );

  return (
    <article className="portfolio-writing">
      <header className="portfolio-writing-masthead">
        <p className="portfolio-writing-kicker">Writing</p>
        <h1 className="portfolio-writing-name">{titleLabel}</h1>
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
      </header>

      {rows.length === 0 ? (
        <p className="portfolio-writing-empty">
          {articles.length === 0
            ? isOwner
              ? 'Add a title in compose to publish an article here.'
              : 'No articles yet.'
            : 'No matching articles.'}
        </p>
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
                      {articleExcerpt(post.value)}
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
