'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import {
  isArticlePost,
  parseArticleSnapshot,
  resolveArticleCover,
} from '@/lib/article-post-payload';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import { moreWritingByAuthor } from '@/lib/more-writing-by-author';
import { writingArticlePath, writingPath } from '@/lib/overlay-routes';
import {
  formatWritingShelfTimestamp,
  postKey,
  postTimestampIso,
} from '@/lib/post-display';

/** Same window as the writing shelf. */
const AUTHOR_ARTICLES_LIMIT = 48;

export function WritingMoreByAuthor({
  accountId,
  name,
  avatarUrl = null,
  postId,
  articles,
  coverHints,
  onOpenArticle,
  onReturnToShelf,
}: {
  accountId: string;
  name: string;
  avatarUrl?: string | null;
  postId: string;
  /** Passed list is used as-is, including empty. Omit to load this author's shelf. */
  articles?: readonly PostRow[];
  coverHints?: Record<string, WritingArticleCoverHint>;
  onOpenArticle?: (post: PostRow) => void;
  /** Shelf is already open under the reader. More closes back onto it. */
  onReturnToShelf?: () => void;
}) {
  const [fetched, setFetched] = useState<PostRow[] | null>(null);
  const [fetchedHints, setFetchedHints] = useState<
    Record<string, WritingArticleCoverHint>
  >({});

  useEffect(() => {
    if (articles !== undefined) return;
    let cancelled = false;
    setFetched(null);
    setFetchedHints({});
    void (async () => {
      try {
        const os = createReadOnlyOnSocialClient();
        const page = await os.query.feed.recent({
          author: accountId,
          limit: AUTHOR_ARTICLES_LIMIT,
          section: 'posts',
        });
        const rows = page.items.filter(isArticlePost);
        if (cancelled) return;
        const { items } = moreWritingByAuthor(rows, { accountId, postId });
        let hints: Record<string, WritingArticleCoverHint> = {};
        if (items.length > 0) {
          const { hydrateWritingArticleCovers } = await import(
            '@/lib/hydrate-writing-article-covers'
          );
          hints = await hydrateWritingArticleCovers(items, os);
        }
        if (cancelled) return;
        setFetched(rows);
        setFetchedHints(hints);
      } catch {
        if (!cancelled) setFetched([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, articles, postId]);

  const source = articles !== undefined ? articles : fetched;
  if (source == null) return null;
  const { items, hasMore } = moreWritingByAuthor(source, {
    accountId,
    postId,
  });
  if (items.length === 0) return null;
  const hints = articles !== undefined ? coverHints : fetchedHints;
  const moreLabel = `More by ${name}`;

  return (
    <section
      className="portfolio-writing-more"
      aria-labelledby="writing-more-by"
    >
      <h2 id="writing-more-by" className="portfolio-writing-more-title">
        {moreLabel}
      </h2>
      <ul className="portfolio-writing-more-list">
        {items.map((post) => {
          const article = parseArticleSnapshot(post.value);
          const title = article?.title?.trim() || 'Article';
          const hint = hints?.[postKey(post)] ?? null;
          const cover = resolveArticleCover({
            value: post.value,
            scarceMediaUrl: hint?.mediaUrl,
            scarceCardBg: hint?.cardBg,
          });
          const issuedAt =
            typeof post.blockTimestamp === 'number'
              ? post.blockTimestamp
              : Number(post.blockTimestamp) || 0;
          const href = writingArticlePath(post.accountId, post.postId);
          return (
            <li key={postKey(post)}>
              <Link
                href={href}
                className="portfolio-writing-card"
                prefetch={false}
                aria-label={title}
                onClick={(event) => {
                  if (!onOpenArticle) return;
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onOpenArticle(post);
                }}
              >
                <div className="portfolio-writing-cover" aria-hidden>
                  <PortfolioWritingCover
                    variant="list"
                    title={title}
                    coverUrl={cover.coverUrl}
                    cardBg={cover.cardBg}
                    format={cover.format}
                    markShape={cover.markShape}
                    markColor={cover.markColor}
                    accountId={post.accountId}
                    displayName={name}
                    avatarUrl={avatarUrl}
                    postId={post.postId}
                    issuedAt={issuedAt}
                  />
                </div>
                <div className="portfolio-writing-card-copy">
                  <h3 className="portfolio-writing-card-title">{title}</h3>
                  <p className="portfolio-writing-card-meta">
                    <time dateTime={postTimestampIso(post.blockTimestamp)}>
                      {formatWritingShelfTimestamp(post.blockTimestamp)}
                    </time>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        onReturnToShelf ? (
          <button
            type="button"
            className="os-surface-chip portfolio-writing-more-link"
            aria-label={moreLabel}
            onClick={onReturnToShelf}
          >
            More
          </button>
        ) : (
          <Link
            href={writingPath(accountId)}
            className="os-surface-chip portfolio-writing-more-link"
            aria-label={moreLabel}
            scroll={false}
          >
            More
          </Link>
        )
      ) : null}
    </section>
  );
}
