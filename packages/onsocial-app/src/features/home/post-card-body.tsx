'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { RepeatIcon } from '@onsocial/ui';
import { OsTextFold } from '@/components/ui/os-text-fold';
import { articleTeaseSource } from '@/lib/article-post-payload';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  postFeedBodyOverflows,
  postFeedPreviewLimit,
  postKindBadge,
  postPreviewNeedsExpand,
  truncatePostPreview,
} from '@/lib/post-display';
import {
  formatPostRelationTarget,
  type PostRelationContext,
} from '@/lib/post-relation';
import { PostRichText } from '@/features/home/post-rich-text';

export function postBadges(post: PostRow, hasPollEmbed: boolean): string[] {
  const badge = postKindBadge(post.kind, hasPollEmbed);
  return badge ? [badge] : [];
}

function PostCardRelationLine({
  relationContext,
  relationTargetProfileName,
}: {
  relationContext: PostRelationContext;
  relationTargetProfileName?: string | null;
}) {
  if (relationContext.kind === 'repost') {
    return (
      <span className="post-card-relation">
        <RepeatIcon className="post-card-relation-icon" aria-hidden />
        {relationContext.label}
      </span>
    );
  }

  const target = formatPostRelationTarget(
    relationContext.handle,
    relationTargetProfileName
  );

  return (
    <span className="post-card-relation">
      {relationContext.verb}{' '}
      <Link
        href={portfolioPath(relationContext.handle)}
        className="os-mention post-card-relation-target"
        scroll={false}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {target.name ? (
          <>
            <span className="post-card-relation-name">{target.name}</span>{' '}
            <span className="post-card-relation-handle">@{target.handle}</span>
          </>
        ) : (
          <span className="post-card-relation-handle">@{target.handle}</span>
        )}
      </Link>
    </span>
  );
}

export function PostCardBody({
  relationContext,
  relationTargetProfileName,
  badges,
  text,
  hideText = false,
  hasMedia = false,
  /** Thread focus / detail — show full copy, no Show more. */
  expandDisabled = false,
  articleTitle = null,
  articleHref = null,
  onReadArticle = null,
  onArticleHrefClick = null,
  onArticleHrefNavigate = null,
}: {
  relationContext: PostRelationContext | null;
  relationTargetProfileName?: string | null;
  badges: string[];
  text: string;
  /** When the poll card already shows the question, skip duplicate body text. */
  hideText?: boolean;
  hasMedia?: boolean;
  expandDisabled?: boolean;
  articleTitle?: string | null;
  articleHref?: string | null;
  /** Feed overlay reader — preferred over hard-nav when set. */
  onReadArticle?: (() => void) | null;
  onArticleHrefClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | null;
  onArticleHrefNavigate?: ((event: { preventDefault(): void }) => void) | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [bodyOverflows, setBodyOverflows] = useState(() =>
    postFeedBodyOverflows(text, hasMedia)
  );
  const previewLimit = postFeedPreviewLimit(hasMedia);
  const isArticle = Boolean(articleTitle && articleHref);
  /** Photo posts peek shorter. The full text stays mounted; the clip folds it. */
  const closedLines = hasMedia ? 3 : 6;
  const foldBody =
    !isArticle && !expandDisabled && !hideText && text.trim().length > 0;
  const tease = isArticle
    ? truncatePostPreview(articleTeaseSource(text), previewLimit)
    : text;
  const showArticleRead =
    isArticle &&
    (Boolean(articleHref) || Boolean(onReadArticle)) &&
    (postPreviewNeedsExpand(text, previewLimit) || Boolean(articleTitle));

  const readControl =
    showArticleRead && onReadArticle ? (
      <button
        type="button"
        className="post-card-show-more post-card-show-more--dots"
        aria-label="Read article"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onReadArticle();
        }}
      >
        …
      </button>
    ) : showArticleRead && articleHref ? (
      <Link
        href={articleHref}
        className="post-card-show-more post-card-show-more--dots"
        aria-label="Read article"
        scroll={false}
        onClick={(event) => {
          event.stopPropagation();
          onArticleHrefClick?.(event);
        }}
        onNavigate={onArticleHrefNavigate ?? undefined}
      >
        …
      </Link>
    ) : null;
  // The tease's static trailing ellipsis is replaced by the ellipsis
  // affordance itself, so the dots sit exactly at the truncation point.
  const teaseDisplay = readControl ? tease.replace(/…$/u, '') : tease;

  return (
    <>
      {relationContext ? (
        <PostCardRelationLine
          relationContext={relationContext}
          relationTargetProfileName={relationTargetProfileName}
        />
      ) : null}
      {badges.length > 0 ? (
        <div className="post-card-badges">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      ) : null}
      {articleTitle ? (
        <p className="post-card-article-title">{articleTitle}</p>
      ) : null}
      {!hideText && tease.trim() ? (
        <div className="post-card-body-block">
          {foldBody ? (
            <OsTextFold
              open={expanded}
              closedLines={closedLines}
              capped
              onOverflow={(overflows) => {
                if (overflows) setBodyOverflows(true);
              }}
            >
              <p className="post-card-body">
                <PostRichText text={text} />
              </p>
            </OsTextFold>
          ) : (
            <p className="post-card-body">
              <PostRichText text={teaseDisplay} inlineMarks={isArticle} />
              {readControl}
            </p>
          )}
          {foldBody && bodyOverflows ? (
            <button
              type="button"
              className={`post-card-show-more${
                expanded
                  ? ''
                  : ' post-card-show-more--fold post-card-show-more--dots'
              }`}
              aria-expanded={expanded}
              aria-label={expanded ? 'Show less' : 'Show more'}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
            >
              {expanded ? 'Show less' : '…'}
            </button>
          ) : null}
        </div>
      ) : readControl ? (
        <div className="post-card-body-block">{readControl}</div>
      ) : null}
    </>
  );
}
