'use client';

import { useMemo, useState, type MouseEvent, type Ref } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  ActionDrawer,
  BookmarkFillIcon,
  BookmarkIcon,
  CheckIcon,
  Divider,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  ShareIcon,
  type ActionDrawerItem,
} from '@onsocial/ui';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { PostLikesSheet } from '@/components/panels/post-likes-sheet';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import {
  PortfolioWritingCover,
  previewWritingCoverSvg,
} from '@/components/portfolio/portfolio-writing-cover';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import { AccountPlaceLink } from '@/components/portfolio/account-place-link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { MediaFaceStandButton } from '@/components/ui/media-face-stand-button';
import { accountIdsEqual } from '@/lib/account-match';
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
  isWritingShelfPath,
  portfolioFromEssayPath,
  writingArticlePath,
  writingFromArticleHref,
} from '@/lib/overlay-routes';
import {
  formatWritingShelfTimestamp,
  parsePostText,
  postKey,
  postTimestampIso,
} from '@/lib/post-display';
import { useEssayReturnSearch } from '@/hooks/use-essay-return-search';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
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
  /** Like / save / thread / share after the essay. Off when a footer owns them. */
  showActions?: boolean;
  /** Author face + name row. Off when the jacket mast already shows them. */
  showAuthor?: boolean;
  /** Optional page title node (unused by quiet article chrome). */
  titleRef?: Ref<HTMLHeadingElement>;
  /**
   * This author's shelf is already open under the reader.
   * Writing closes back onto that list instead of pushing another one.
   */
  onReturnToShelf?: () => void;
};

export function PortfolioWritingArticleActions({
  post,
  className,
  onReply,
  shareExtras,
}: {
  post: PostRow;
  className?: string;
  /** Feed — pin the write dock. Omit to open the thread. */
  onReply?: () => void;
  /** Feed — quote / repost / amplify live in Share. */
  shareExtras?: ActionDrawerItem[];
}) {
  const article = parseArticleSnapshot(post.value);
  const articleHref = writingArticlePath(post.accountId, post.postId);
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
  const savePending = isSavePending(post);
  const likePending = isReactionPending(post);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const extras = shareExtras ?? [];

  const shareArticle = () => {
    const url = absoluteArticleUrl(articleHref);
    if (!url) return;
    void (async () => {
      const result = await shareUrl({
        url,
        title: article?.title ?? 'Article',
        text: `Read “${article?.title ?? 'this article'}” on OnSocial`,
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
    <div
      className={`portfolio-writing-article-actions${className ? ` ${className}` : ''}`}
    >
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
      {onReply ? (
        <button
          type="button"
          className="portfolio-writing-article-action"
          aria-label="Reply"
          title="Reply"
          onClick={onReply}
        >
          <MessageRoundIcon className="portfolio-writing-article-action-icon" />
        </button>
      ) : (
        <Link
          href={personalPostPath(post.accountId, post.postId)}
          className="portfolio-writing-article-action"
          scroll={false}
          prefetch={false}
          aria-label="Reply"
          title="Reply"
        >
          <MessageRoundIcon className="portfolio-writing-article-action-icon" />
        </Link>
      )}
      <button
        type="button"
        className={`portfolio-writing-article-action${
          shareCopied ? ' is-copied' : ''
        }`}
        aria-label={shareCopied ? 'Link copied' : 'Share this article'}
        title={shareCopied ? 'Link copied' : 'Share'}
        onClick={() => {
          if (extras.length > 0) {
            setShareOpen(true);
            return;
          }
          shareArticle();
        }}
      >
        {shareCopied ? (
          <CheckIcon className="portfolio-writing-article-action-icon" />
        ) : (
          <ShareIcon className="portfolio-writing-article-action-icon" />
        )}
      </button>
      {extras.length > 0 ? (
        <ActionDrawer
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          label="Share"
          zIndex={SCARCE_Z.commerceOverListen}
          items={[
            {
              id: 'copy',
              label: shareCopied ? 'Link copied' : 'Copy link',
              onSelect: () => {
                setShareOpen(false);
                shareArticle();
              },
            },
            ...extras.map((item) => ({
              ...item,
              onSelect: () => {
                setShareOpen(false);
                item.onSelect?.();
              },
            })),
          ]}
        />
      ) : null}
    </div>
  );
}

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
  titleRef,
  onReturnToShelf,
}: PortfolioWritingArticlePanelProps) {
  const article = parseArticleSnapshot(post.value);
  const cover = resolveArticleCover({
    value: post.value,
    scarceMediaUrl: coverHint?.mediaUrl,
    scarceCardBg: coverHint?.cardBg,
  });
  const body = parsePostText(post.value);
  const authorName = displayName(post.accountId, titleLabel);
  const pathname = usePathname();
  const returnSearch = useEssayReturnSearch();
  const authorHref = portfolioFromEssayPath(
    post.accountId,
    post.postId,
    pathname
  );
  const writingHref = writingFromArticleHref(
    accountId,
    post.postId,
    pathname,
    returnSearch
  );
  const shelfAlreadyOpen = isWritingShelfPath(accountId, pathname);
  const onWritingClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    if (!shelfAlreadyOpen) return;
    event.preventDefault();
    onReturnToShelf?.();
  };
  const { accountId: viewerAccountId } = useAppWallet();
  const { engagement } = usePostEngagement([post]);
  const row = engagement[postKey(post)] ?? EMPTY_POST_ENGAGEMENT;
  const liked = row.viewerReacted;
  const likeCount = row.reactionCount;
  const [likesOpen, setLikesOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const readLabel = formatWritingReadLabel(body);
  const likeLabel = formatWritingLikeLabel(likeCount);
  const issuedAt =
    typeof post.blockTimestamp === 'number'
      ? post.blockTimestamp
      : Number(post.blockTimestamp) || 0;
  const dateline = formatWritingShelfTimestamp(post.blockTimestamp);
  const datelineIso = postTimestampIso(post.blockTimestamp);
  const articleTitle = article?.title ?? '';
  const coverSvg = useMemo(() => {
    if (!articleTitle || cover.coverUrl) return null;
    return previewWritingCoverSvg({
      title: articleTitle,
      accountId: post.accountId,
      displayName: authorName,
      avatarUrl,
      postId: post.postId,
      issuedAt,
      cardBg: cover.cardBg,
      format: cover.format,
      markShape: cover.markShape,
      markColor: cover.markColor,
    });
  }, [
    articleTitle,
    authorName,
    avatarUrl,
    cover.cardBg,
    cover.coverUrl,
    cover.format,
    cover.markColor,
    cover.markShape,
    issuedAt,
    post.accountId,
    post.postId,
  ]);

  if (!article) return null;

  return (
    <article className="portfolio-writing portfolio-writing-article">
      {/*
       * About spread: pinned cover is the print, masthead is the type
       * column — title, rule, "Writing", then the author line.
       */}
      <div className="portfolio-writing-article-spread">
        <button
          type="button"
          className={`portfolio-writing-article-cover${
            cover.coverUrl ? ' is-photo' : ' is-card'
          }`}
          aria-label="View cover"
          onClick={() => setCoverOpen(true)}
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
            issuedAt={issuedAt}
          />
        </button>

        <header className="portfolio-writing-masthead">
          <h1 ref={titleRef} className="portfolio-writing-article-title">
            {article.title}
          </h1>
          <Divider
            variant="detail"
            className="portfolio-writing-article-rule"
          />
          <div className="portfolio-writing-article-meta">
            {datelineIso ? (
              <time
                className="portfolio-writing-dateline"
                dateTime={datelineIso}
              >
                {dateline}
              </time>
            ) : null}
            <p className="portfolio-writing-byline">
              <AccountPlaceLink href={writingHref} onClick={onWritingClick}>
                Writing
              </AccountPlaceLink>
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
          </div>
        </header>
      </div>

      {showAuthor ? (
        <div className="portfolio-writing-article-author">
          <AccountPlaceLink
            href={authorHref}
            className="os-media-face-identity"
            aria-label={`View ${authorName}'s profile`}
          >
            <AccountAvatar
              accountId={post.accountId}
              src={avatarUrl}
              fallbackInitial={authorName}
              size="lg"
              className="post-card-avatar"
            />
            <span className="os-media-face-identity-copy">
              <span className="os-media-face-identity-name-row">
                <span className="os-media-face-identity-name">
                  {authorName}
                </span>
                <span className="post-identity-name-marks">
                  <ProtocolNameTrailing accountId={post.accountId} />
                </span>
              </span>
              <span className="os-media-face-identity-handle">
                @{post.accountId}
              </span>
            </span>
          </AccountPlaceLink>
          {!(
            viewerAccountId && accountIdsEqual(viewerAccountId, post.accountId)
          ) ? (
            <MediaFaceStandButton
              accountId={post.accountId}
              name={authorName}
              avatarUrl={avatarUrl}
              className="portfolio-writing-article-stand"
            />
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

      {showActions ? (
        <PortfolioWritingArticleActions post={post} className="is-afterword" />
      ) : null}

      {coverOpen ? (
        <DropArtOverlay
          open={coverOpen}
          src={cover.coverUrl ?? undefined}
          svg={coverSvg}
          label={article.title}
          onClose={() => setCoverOpen(false)}
        />
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
