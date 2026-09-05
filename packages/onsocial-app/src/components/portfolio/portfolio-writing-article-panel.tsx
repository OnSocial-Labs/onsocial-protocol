'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import {
  BookmarkFillIcon,
  BookmarkIcon,
} from '@onsocial/ui';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import {
  articleCoverUrl,
  parseArticleSnapshot,
} from '@/lib/article-post-payload';
import { writingPath } from '@/lib/overlay-routes';
import { parsePostText, postKey } from '@/lib/post-display';
import { personalPostPath } from '@/lib/post-routes';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';

export type PortfolioWritingArticlePanelProps = {
  accountId: string;
  titleLabel: string;
  avatarUrl?: string | null;
  post: PostRow;
};

export function PortfolioWritingArticlePanel({
  accountId,
  titleLabel,
  avatarUrl = null,
  post,
}: PortfolioWritingArticlePanelProps) {
  const article = parseArticleSnapshot(post.value);
  const coverUrl = articleCoverUrl(post.value);
  const body = parsePostText(post.value);
  const { engagement, toggleSave, isSavePending } = usePostEngagement([post]);
  const saved =
    engagement[postKey(post)]?.viewerSaved ?? EMPTY_POST_ENGAGEMENT.viewerSaved;
  const savePending = isSavePending(post);

  if (!article) return null;

  return (
    <article className="portfolio-writing portfolio-writing-article">
      <header className="portfolio-writing-masthead">
        <p className="portfolio-writing-kicker">
          <Link href={writingPath(accountId)} scroll={false}>
            Writing
          </Link>
        </p>
        <h1 className="portfolio-writing-article-title">{article.title}</h1>
        <p className="portfolio-writing-byline">{titleLabel}</p>
      </header>

      {coverUrl ? (
        <div className="portfolio-writing-article-cover">
          <PortfolioWritingCover
            title={article.title}
            coverUrl={coverUrl}
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
      ) : null}

      {body.trim() ? (
        <div
          className="portfolio-about-essay portfolio-about-rest portfolio-writing-essay"
          data-about-align={article.align}
        >
          <PortfolioBioBlocks text={body} />
        </div>
      ) : null}

      <footer className="portfolio-writing-article-footer">
        <button
          type="button"
          className={`portfolio-writing-save${saved ? ' is-active' : ''}${
            savePending ? ' is-pending' : ''
          }`}
          disabled={savePending}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save this article'}
          onClick={() => {
            void toggleSave(post);
          }}
        >
          {saved ? (
            <BookmarkFillIcon className="portfolio-writing-save-icon" />
          ) : (
            <BookmarkIcon className="portfolio-writing-save-icon" />
          )}
          {saved ? 'Saved' : 'Save'}
        </button>
        <Link
          href={personalPostPath(post.accountId, post.postId)}
          className="portfolio-about-link"
          scroll={false}
        >
          Thread
        </Link>
      </footer>
    </article>
  );
}
