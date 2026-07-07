'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ProfileAvatar } from '@onsocial/ui';
import { appPageHref } from '@/lib/app-links';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  parsePostText,
  postKey,
  postTimestampIso,
} from '@/lib/post-display';
import { fallbackLabel } from '@/lib/profile-display';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import type { PostEngagement } from '@/hooks/use-post-engagement';

interface PostCardProps {
  post: PostRow;
  actionHref?: string;
  authorProfile?: PostAuthorProfile;
  /** Extra classes, e.g. thread chain position modifiers. */
  className?: string;
  /** Compact inset preview of the post this one quotes. */
  quotedPost?: PostRow;
  quotedAuthorProfile?: PostAuthorProfile;
  /** Hide the Reply/Quote relation badge (redundant inside thread tabs). */
  showRelationBadge?: boolean;
  engagement?: PostEngagement;
  reactionPending?: boolean;
  onToggleReaction?: (post: PostRow) => void;
  /** Open a reply composer targeting this post. */
  onReply?: (post: PostRow) => void;
  /** Open a quote composer targeting this post. */
  onQuote?: (post: PostRow) => void;
}

function postRelationLabel(post: PostRow): string | null {
  if (post.parentPath) return 'Reply';
  if (post.refPath) return 'Quote';
  return null;
}

function postBadges(post: PostRow, showRelationBadge: boolean): string[] {
  return [
    showRelationBadge ? postRelationLabel(post) : null,
    post.channel,
    post.kind,
  ].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
}

export function QuotedPostInset({
  post,
  authorProfile,
}: {
  post: PostRow;
  authorProfile?: PostAuthorProfile;
}) {
  const name =
    authorProfile?.displayName?.trim() || fallbackLabel(post.accountId);
  const text = parsePostText(post.value);

  return (
    <div className="post-card-quote-inset">
      <span className="post-card-quote-inset-head">
        <ProfileAvatar
          src={authorProfile?.avatarUrl ?? null}
          fallbackInitial={name}
          size="sm"
          className="post-card-quote-inset-avatar"
        />
        <span className="post-card-quote-inset-name">{name}</span>
        <span className="post-card-quote-inset-handle">@{post.accountId}</span>
      </span>
      <p className="post-card-quote-inset-body">{text || '…'}</p>
    </div>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5c-3.3 0-6 2.2-6 5 0 1.5.8 2.9 2.1 3.8L3.5 13.9c-.1.3.2.6.5.4l2.6-1.4c.5.1.9.1 1.4.1 3.3 0 6-2.2 6-5s-2.7-5.5-6-5.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 10.5V8.2C3 5.9 4.4 4.2 6.5 3.5M9.5 10.5V8.2c0-2.3 1.4-4 3.5-4.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="4" cy="11" r="1.4" stroke="currentColor" strokeWidth="1.2" />
      <circle
        cx="10.5"
        cy="11"
        r="1.4"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ReactIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden
    >
      <path
        d="M8 13.4 3.2 8.9a3.1 3.1 0 0 1 0-4.5 3.4 3.4 0 0 1 4.6 0l.2.2.2-.2a3.4 3.4 0 0 1 4.6 0 3.1 3.1 0 0 1 0 4.5L8 13.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EngagementStat({
  icon,
  count,
  label,
  actionLabel,
  onActivate,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  actionLabel?: string;
  onActivate?: () => void;
}) {
  if (onActivate) {
    return (
      <button
        type="button"
        className="post-card-stat post-card-stat-button"
        aria-label={actionLabel ?? label}
        title={actionLabel ?? label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }}
      >
        {icon}
        {count > 0 ? <span>{count}</span> : null}
      </button>
    );
  }

  return (
    <span
      className="post-card-stat"
      aria-label={`${count} ${label}`}
      title={label}
    >
      {icon}
      {count > 0 ? <span>{count}</span> : null}
    </span>
  );
}

export function PostRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="post-row-skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="post-card post-card--skeleton">
          <div className="post-card-avatar post-row-skeleton-avatar standing-row-shimmer" />
          <div className="post-card-copy">
            <div className="standing-row-shimmer post-row-skeleton-line" />
            <div className="standing-row-shimmer post-row-skeleton-line-sm" />
            <div className="standing-row-shimmer post-row-skeleton-line-body" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PostCard({
  post,
  actionHref,
  authorProfile,
  className,
  quotedPost,
  quotedAuthorProfile,
  showRelationBadge = true,
  engagement,
  reactionPending,
  onToggleReaction,
  onReply,
  onQuote,
}: PostCardProps) {
  const text = parsePostText(post.value);
  const fallback = fallbackLabel(post.accountId);
  const name = authorProfile?.displayName?.trim() || fallback;
  const handle = `@${post.accountId}`;
  const timestampIso = postTimestampIso(post.blockTimestamp);
  const badges = postBadges(post, showRelationBadge);

  const handleReactionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleReaction?.(post);
  };

  const content = (
    <>
      <ProfileAvatar
        src={authorProfile?.avatarUrl ?? null}
        fallbackInitial={name}
        size="lg"
        className="post-card-avatar"
      />
      <div className="post-card-copy">
        <header className="post-card-header">
          {actionHref ? (
            <span className="post-card-author">{name}</span>
          ) : (
            <Link
              className="post-card-author"
              href={appPageHref(post.accountId)}
            >
              {name}
            </Link>
          )}
          <time
            className="post-card-time"
            title={formatPostTimestamp(post.blockTimestamp)}
            {...(timestampIso ? { dateTime: timestampIso } : {})}
          >
            {formatRelativePostTimestamp(post.blockTimestamp)}
          </time>
        </header>
        <span className="post-card-handle">{handle}</span>
        {badges.length > 0 ? (
          <div className="post-card-badges">
            {badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        ) : null}
        <p className="post-card-body">{text || '…'}</p>
        {quotedPost ? (
          <QuotedPostInset
            post={quotedPost}
            authorProfile={quotedAuthorProfile}
          />
        ) : null}
        {engagement ? (
          <div className="post-card-engagement">
            <EngagementStat
              icon={<ReplyIcon />}
              count={engagement.replyCount}
              label="replies"
              actionLabel={onReply ? 'Reply to this post' : undefined}
              onActivate={onReply ? () => onReply(post) : undefined}
            />
            <EngagementStat
              icon={<QuoteIcon />}
              count={engagement.quoteCount}
              label="quotes"
              actionLabel={onQuote ? 'Quote this post' : undefined}
              onActivate={onQuote ? () => onQuote(post) : undefined}
            />
            {onToggleReaction ? (
              <button
                type="button"
                className={`post-card-react${engagement.viewerReacted ? ' is-active' : ''}${reactionPending ? ' is-pending' : ''}`}
                disabled={reactionPending}
                aria-pressed={engagement.viewerReacted}
                aria-label={
                  engagement.viewerReacted
                    ? 'Remove your reaction'
                    : 'React to this post'
                }
                onClick={handleReactionClick}
              >
                <ReactIcon filled={engagement.viewerReacted} />
                {engagement.reactionCount > 0 ? (
                  <span>{engagement.reactionCount}</span>
                ) : null}
              </button>
            ) : (
              <EngagementStat
                icon={<ReactIcon filled={false} />}
                count={engagement.reactionCount}
                label="reactions"
              />
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  const cardClassName = `post-card animate-rise-in${className ? ` ${className}` : ''}`;

  if (actionHref) {
    return (
      <Link className={`${cardClassName} post-card-link`} href={actionHref}>
        {content}
      </Link>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}

export { postKey };
