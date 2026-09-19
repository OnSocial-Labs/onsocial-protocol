'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import {
  BookmarkFillIcon,
  BookmarkIcon,
  CheckIcon,
  Divider,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  ShareIcon,
} from '@onsocial/ui';
import { PostLikesSheet } from '@/components/panels/post-likes-sheet';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  formatWritingLikeLabel,
  formatWritingReadLabel,
  parseArticleSnapshot,
  resolveArticleCover,
} from '@/lib/article-post-payload';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import {
  portfolioPath,
  writingArticlePath,
  writingPath,
} from '@/lib/overlay-routes';
import { parsePostText, postKey } from '@/lib/post-display';
import { displayName } from '@/lib/profile-display';
import { personalPostPath } from '@/lib/post-routes';
import { shareUrl } from '@/lib/share-url';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';

export type PortfolioWritingArticlePanelProps = {
  accountId: string;
  titleLabel: string;
  avatarUrl?: string | null;
  post: PostRow;
  coverHint?: WritingArticleCoverHint | null;
  /** Like / save / thread / share under the byline. Off when a footer owns them. */
  showActions?: boolean;
  /** Author face + name row. Off when the jacket mast already shows them. */
  showAuthor?: boolean;
};

function absoluteArticleUrl(href: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return null;
  }
}

export function PortfolioWritingArticlePanel({
  accountId,
  titleLabel,
  avatarUrl = null,
  post,
  coverHint = null,
  showActions = true,
  showAuthor = true,
}: PortfolioWritingArticlePanelProps) {
  const article = parseArticleSnapshot(post.value);
  const cover = resolveArticleCover({
    value: post.value,
    scarceMediaUrl: coverHint?.mediaUrl,
    scarceCardBg: coverHint?.cardBg,
  });
  const body = parsePostText(post.value);
  const authorName = displayName(post.accountId, titleLabel);
  const authorHref = portfolioPath(post.accountId);
  const articleHref = writingArticlePath(post.accountId, post.postId);
  const { accountId: viewerAccountId } = useAppWallet();
  const {
    engagement,
    toggleSave,
    toggleReaction,
    isSavePending,
    isReactionPending,
  } = usePostEngagement([post]);
  const { setTxResult } = useAppTransactionFeedback();
  const row = engagement[postKey(post)] ?? EMPTY_POST_ENGAGEMENT;
  const saved = row.viewerSaved;
  const liked = row.viewerReacted;
  const likeCount = row.reactionCount;
  const savePending = isSavePending(post);
  const likePending = isReactionPending(post);
  const [shareCopied, setShareCopied] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const readLabel = formatWritingReadLabel(body);
  const likeLabel = formatWritingLikeLabel(likeCount);

  if (!article) return null;

  const shareArticle = () => {
    const url = absoluteArticleUrl(articleHref);
    if (!url) return;
    void (async () => {
      const result = await shareUrl({
        url,
        title: article.title,
        text: `Read “${article.title}” on OnSocial`,
      });
      if (result === 'copied') {
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 1600);
        return;
      }
      if (result === 'failed') {
        setTxResult({
          type: 'error',
          msg: 'Couldn’t share this article.',
        });
      }
    })();
  };

  return (
    <article className="portfolio-writing portfolio-writing-article">
      {/*
       * About spread: pinned cover is the print, masthead is the type
       * column — title, rule, "Writing", then the author line.
       */}
      <div className="portfolio-writing-article-spread">
        <div
          className={`portfolio-writing-article-cover${
            cover.coverUrl ? ' is-photo' : ' is-card'
          }`}
          aria-hidden
        >
          <PortfolioWritingCover
            variant="article"
            title={article.title}
            coverUrl={cover.coverUrl}
            cardBg={cover.cardBg}
            format={cover.format}
            markShape={cover.markShape}
            markColor={cover.markColor}
            accountId={post.accountId}
            displayName={authorName}
            avatarUrl={avatarUrl}
            postId={post.postId}
            issuedAt={
              typeof post.blockTimestamp === 'number'
                ? post.blockTimestamp
                : Number(post.blockTimestamp) || 0
            }
          />
        </div>

        <header className="portfolio-writing-masthead">
          <h1 className="portfolio-writing-article-title">{article.title}</h1>
          <Divider
            variant="detail"
            className="portfolio-writing-article-rule"
          />
          <p className="portfolio-writing-byline">
            <Link href={writingPath(accountId)} scroll={false} prefetch={false}>
              Writing
            </Link>
            {readLabel ? (
              <>
                <span className="portfolio-writing-byline-sep" aria-hidden>
                  ·
                </span>
                <span>{readLabel}</span>
              </>
            ) : null}
            {likeLabel ? (
              <>
                <span className="portfolio-writing-byline-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="portfolio-writing-byline-likes"
                  aria-label={`View who liked — ${likeLabel}`}
                  onClick={() => setLikesOpen(true)}
                >
                  {likeLabel}
                </button>
              </>
            ) : null}
          </p>
        </header>
      </div>

      {showAuthor || showActions ? (
        <div className="portfolio-writing-article-author">
          {showAuthor ? (
            <>
              <Link
                href={authorHref}
                className="portfolio-writing-article-face"
                scroll={false}
                prefetch={false}
                aria-label={`View ${authorName}'s profile`}
              >
                <AccountAvatar
                  accountId={post.accountId}
                  src={avatarUrl}
                  fallbackInitial={authorName}
                  size="md"
                />
              </Link>
              <Link
                href={authorHref}
                className="portfolio-writing-article-author-name"
                scroll={false}
                prefetch={false}
              >
                {authorName}
              </Link>
            </>
          ) : null}
          {showActions ? (
            <div className="portfolio-writing-article-actions">
              <button
                type="button"
                className={`portfolio-writing-article-action${
                  liked ? ' is-active' : ''
                }${likePending ? ' is-pending' : ''}`}
                disabled={likePending}
                aria-pressed={liked}
                aria-label={liked ? 'Remove your like' : 'Like this article'}
                title={liked ? 'Liked' : 'Like'}
                onClick={() => {
                  void toggleReaction(post);
                }}
              >
                {liked ? (
                  <HeartFillIcon className="portfolio-writing-article-action-icon" />
                ) : (
                  <HeartIcon className="portfolio-writing-article-action-icon" />
                )}
              </button>
              <button
                type="button"
                className={`portfolio-writing-article-action${
                  saved ? ' is-active' : ''
                }${savePending ? ' is-pending' : ''}`}
                disabled={savePending}
                aria-pressed={saved}
                aria-label={saved ? 'Remove from saved' : 'Save this article'}
                title={saved ? 'Saved' : 'Save'}
                onClick={() => {
                  void toggleSave(post);
                }}
              >
                {saved ? (
                  <BookmarkFillIcon className="portfolio-writing-article-action-icon" />
                ) : (
                  <BookmarkIcon className="portfolio-writing-article-action-icon" />
                )}
              </button>
              <Link
                href={personalPostPath(post.accountId, post.postId)}
                className="portfolio-writing-article-action"
                scroll={false}
                prefetch={false}
                aria-label="View thread"
                title="Thread"
              >
                <MessageRoundIcon className="portfolio-writing-article-action-icon" />
              </Link>
              <button
                type="button"
                className={`portfolio-writing-article-action${
                  shareCopied ? ' is-copied' : ''
                }`}
                aria-label={shareCopied ? 'Link copied' : 'Share this article'}
                title={shareCopied ? 'Link copied' : 'Share'}
                onClick={shareArticle}
              >
                {shareCopied ? (
                  <CheckIcon className="portfolio-writing-article-action-icon" />
                ) : (
                  <ShareIcon className="portfolio-writing-article-action-icon" />
                )}
              </button>
            </div>
          ) : null}
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

      <PostLikesSheet
        open={likesOpen}
        onClose={() => setLikesOpen(false)}
        postOwner={post.accountId}
        postId={post.postId}
        groupId={post.groupId}
        likeCount={likeCount}
        title={article.title}
        viewerAccountId={viewerAccountId}
        viewerLiked={liked}
      />
    </article>
  );
}
