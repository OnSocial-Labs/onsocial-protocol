'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ProfileAvatar } from '@onsocial/ui';
import { appPageHref } from '@/lib/app-links';
import {
  formatPostTimestamp,
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
  contextLabel?: string;
  engagement?: PostEngagement;
  reactionPending?: boolean;
  onToggleReaction?: (post: PostRow) => void;
}

function postRelationLabel(post: PostRow): string | null {
  if (post.parentPath) return 'Reply';
  if (post.refPath) return 'Quote';
  return null;
}

function postBadges(post: PostRow): string[] {
  return [postRelationLabel(post), post.channel, post.kind].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
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
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
}) {
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

export function PostCard({
  post,
  actionHref,
  authorProfile,
  contextLabel,
  engagement,
  reactionPending,
  onToggleReaction,
}: PostCardProps) {
  const text = parsePostText(post.value);
  const fallback = fallbackLabel(post.accountId);
  const name = authorProfile?.displayName?.trim() || fallback;
  const handle = `@${post.accountId}`;
  const timestampIso = postTimestampIso(post.blockTimestamp);
  const badges = postBadges(post);

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
            {...(timestampIso ? { dateTime: timestampIso } : {})}
          >
            {formatPostTimestamp(post.blockTimestamp)}
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
        {contextLabel ? (
          <p className="post-card-context">{contextLabel}</p>
        ) : null}
        <p className="post-card-body">{text || '…'}</p>
        {engagement ? (
          <div className="post-card-engagement">
            <EngagementStat
              icon={<ReplyIcon />}
              count={engagement.replyCount}
              label="replies"
            />
            <EngagementStat
              icon={<QuoteIcon />}
              count={engagement.quoteCount}
              label="quotes"
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

  if (actionHref) {
    return (
      <Link
        className="post-card post-card-link animate-rise-in"
        href={actionHref}
      >
        {content}
      </Link>
    );
  }

  return <article className="post-card animate-rise-in">{content}</article>;
}

export { postKey };
