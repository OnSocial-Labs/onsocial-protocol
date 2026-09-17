'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { OsAppScreen } from '@/components/app/os-app-screen';
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
import {
  articleExcerpt,
  articleMatchesQuery,
  formatWritingLikeLabel,
  formatWritingReadLabel,
  parseArticleSnapshot,
  resolveArticleCover,
  resolveWritingEmptyState,
  shouldShowWritingSearch,
} from '@/lib/article-post-payload';
import { accountIdsEqual } from '@/lib/account-match';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { portfolioPath, writingArticlePath } from '@/lib/overlay-routes';
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
};

function PortfolioWritingList({
  accountId,
  titleLabel,
  avatarUrl,
  articles,
  coverHints,
  query,
  showSearch,
}: PortfolioWritingPanelProps & {
  query: string;
  showSearch: boolean;
}) {
  const { accountId: viewerId } = useAppWallet();
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
            return (
              <li key={`${post.accountId}:${post.postId}`}>
                <Link
                  href={writingArticlePath(post.accountId, post.postId)}
                  className="portfolio-writing-card"
                  scroll={false}
                  aria-label={article.title}
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
}

function useWritingShelfState(articleCount: number) {
  const [query, setQuery] = useState('');
  const showSearch = shouldShowWritingSearch(articleCount);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  return { query, setQuery, showSearch, scrollRootRef };
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
  const { query, setQuery, showSearch, scrollRootRef } = useWritingShelfState(
    panel.articles.length
  );
  /* Overlay: mood wash lives on the glass sheet — keep the screen clear. */
  const moodId = embedded ? null : mood.id;
  const moodStyle = embedded ? undefined : portfolioMoodShellStyle(mood.cssVars);

  return (
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
          articleCount={panel.articles.length}
        />
      }
    >
      <div aria-hidden className="os-chrome-glass" />
      <PortfolioPersonalComposer pageAccountId={panel.accountId} />
      <PortfolioWritingList
        {...panel}
        query={query}
        showSearch={showSearch}
      />
    </OsAppScreen>
  );
}

/** Hard refresh / shared Writing URL. */
export function PortfolioWritingScreen({
  mood,
  ...panel
}: PortfolioWritingPanelProps & { mood: ResolvedMood }) {
  return <PortfolioWritingShelf mood={mood} {...panel} />;
}

/** Soft-nav Writing overlay — same compact chrome as hard refresh. */
export function PortfolioWritingOverlay({
  mood,
  ...panel
}: PortfolioWritingPanelProps & { mood: ResolvedMood }) {
  const dismiss = useOverlayDismiss();

  return (
    <>
      <OverlayPanelChrome ariaTitle="Writing" hideTitle />
      <PortfolioWritingShelf
        mood={mood}
        embedded
        onDockBack={dismiss}
        {...panel}
      />
    </>
  );
}

/** @deprecated Prefer {@link PortfolioWritingScreen} / {@link PortfolioWritingOverlay}. */
export function PortfolioWritingPanel(panel: PortfolioWritingPanelProps) {
  const { query, showSearch } = useWritingShelfState(panel.articles.length);
  return (
    <PortfolioWritingList
      {...panel}
      query={query}
      showSearch={showSearch}
    />
  );
}
