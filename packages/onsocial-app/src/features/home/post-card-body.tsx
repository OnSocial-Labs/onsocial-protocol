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
  /** Thread focus / detail — open unfolded, with Show less to fold it back. */
  startExpanded = false,
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
  startExpanded?: boolean;
  articleTitle?: string | null;
  articleHref?: string | null;
  /** Feed overlay reader — preferred over hard-nav when set. */
  onReadArticle?: (() => void) | null;
  onArticleHrefClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | null;
  onArticleHrefNavigate?: ((event: { preventDefault(): void }) => void) | null;
}) {
  const isArticle = Boolean(articleTitle && articleHref);
  const articleSource = isArticle ? articleTeaseSource(text) : '';
  const [expanded, setExpanded] = useState(startExpanded);
  const [bodyOverflows, setBodyOverflows] = useState(() =>
    postFeedBodyOverflows(text, hasMedia)
  );
  const previewLimit = postFeedPreviewLimit(hasMedia);
  /** Photo posts peek shorter. The full text stays mounted; the clip folds it. */
  const closedLines = hasMedia ? 3 : 6;
  const foldBody =
    !isArticle && !hideText && text.trim().length > 0;
  const tease = isArticle ? articleSource : text;
  const showArticleRead =
    isArticle &&
    (Boolean(articleHref) || Boolean(onReadArticle)) &&
    (postPreviewNeedsExpand(text, previewLimit) || Boolean(articleTitle));

  const readControl =
    showArticleRead && onReadArticle ? (
      <button
        type="button"
        className="post-card-show-more post-card-read-more post-card-show-more--slot"
        aria-label="Read more"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onReadArticle();
        }}
      >
        Read more
      </button>
    ) : showArticleRead && articleHref ? (
      <Link
        href={articleHref}
        className="post-card-show-more post-card-read-more post-card-show-more--slot"
        aria-label="Read more"
        scroll={false}
        onClick={(event) => {
          event.stopPropagation();
          onArticleHrefClick?.(event);
        }}
        onNavigate={onArticleHrefNavigate ?? undefined}
      >
        Read more
      </Link>
    ) : null;
  const foldClosed = foldBody && bodyOverflows && !expanded;

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
        <div
          className={`post-card-body-block${foldClosed ? ' is-fold-closed' : ''}`}
          onClick={
            foldClosed
              ? (event) => {
                  const target = event.target;
                  if (
                    target instanceof Element &&
                    target.closest(
                      'a, button, .os-hashtag, .os-mention, .os-ticker, .os-link'
                    )
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded(true);
                }
              : undefined
          }
        >
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
                {foldClosed ? (
                  <button
                    type="button"
                    className="post-card-show-more post-card-show-more--slot"
                    aria-expanded={false}
                    aria-label="Show more"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExpanded(true);
                    }}
                  >
                    Show more
                  </button>
                ) : null}
                <PostRichText text={text} />
              </p>
            </OsTextFold>
          ) : isArticle ? (
            <div className="post-card-article-clamp">
              <p className="post-card-body">
                {readControl}
                <PostRichText text={tease} inlineMarks />
              </p>
            </div>
          ) : (
            <p className="post-card-body">
              <PostRichText text={tease} />
            </p>
          )}
          {foldBody && bodyOverflows && expanded ? (
            <button
              type="button"
              className="post-card-show-more"
              aria-expanded
              aria-label="Show less"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded(false);
              }}
            >
              Show less
            </button>
          ) : null}
        </div>
      ) : readControl ? (
        <div className="post-card-body-block">{readControl}</div>
      ) : null}
    </>
  );
}
