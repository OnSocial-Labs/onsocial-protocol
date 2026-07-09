'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  Divider,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  ProfileAvatar,
  RepeatIcon,
} from '@onsocial/ui';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { parsePostText, postKey } from '@/lib/post-display';
import { portfolioPath } from '@/lib/overlay-routes';
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
  /** Click-through to the quoted post's own page. */
  quotedHref?: string;
  /** Hide the `Replying to @x` context line (redundant inside thread tabs). */
  showRelationBadge?: boolean;
  /** Show `· #channel` in the identity line (mixed "All" feeds only). */
  showChannel?: boolean;
  engagement?: PostEngagement;
  reactionPending?: boolean;
  onToggleReaction?: (post: PostRow) => void;
  /** Open a reply composer targeting this post. */
  onReply?: (post: PostRow) => void;
  /** Open a quote composer targeting this post. */
  onQuote?: (post: PostRow) => void;
}

function postBadges(post: PostRow): string[] {
  // 'text' is the default kind — badge only exceptional kinds (media, poll…).
  return [post.kind === 'text' ? null : post.kind].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
}

/** `Replying to @x` / `Quoting @x` — muted context line instead of a pill. */
function postRelationContext(
  post: PostRow,
  hasQuoteInset: boolean
): { verb: string; handle: string } | null {
  if (post.parentPath) {
    const handle = post.parentAuthor ?? post.parentPath.split('/')[0];
    return handle ? { verb: 'Replying to', handle } : null;
  }
  // The quote inset already shows who's quoted — only label when it's absent.
  if (post.refPath && !hasQuoteInset) {
    const handle = post.refAuthor ?? post.refPath.split('/')[0];
    return handle ? { verb: 'Quoting', handle } : null;
  }
  return null;
}

export function QuotedPostInset({
  post,
  authorProfile,
  href,
}: {
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  /** Navigate to the quoted post's own page (feed/thread surfaces). */
  href?: string;
}) {
  const router = useRouter();
  const name =
    authorProfile?.displayName?.trim() || fallbackLabel(post.accountId);
  const text = parsePostText(post.value);
  const interactive = Boolean(href);

  const open = (event: { preventDefault(): void; stopPropagation(): void }) => {
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    router.push(href);
  };

  return (
    <div
      className={`post-card-quote-inset${interactive ? ' post-card-quote-inset--link' : ''}`}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `View quoted post by ${name}` : undefined}
      onClick={interactive ? open : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') open(event);
            }
          : undefined
      }
    >
      <Divider orientation="vertical" variant="green-detail" />
      <div className="post-card-quote-inset-content">
        <span className="post-card-quote-inset-head">
          <ProfileAvatar
            src={authorProfile?.avatarUrl ?? null}
            fallbackInitial={name}
            size="sm"
            className="post-card-quote-inset-avatar"
          />
          <PostIdentityMeta
            name={name}
            accountId={post.accountId}
            timestamp={post.blockTimestamp}
          />
        </span>
        <p className="post-card-quote-inset-body">{text || '…'}</p>
      </div>
    </div>
  );
}

function ReactIcon({ filled }: { filled: boolean }) {
  return filled ? <HeartFillIcon aria-hidden /> : <HeartIcon aria-hidden />;
}

function engagementStatClassName(
  tone: 'reply' | 'quote' | undefined,
  interactive: boolean,
  className?: string
) {
  if (className) return className;
  const toneClass =
    tone === 'reply'
      ? ' post-card-stat--reply'
      : tone === 'quote'
        ? ' post-card-stat--quote'
        : '';
  return interactive
    ? `post-card-stat post-card-stat-button${toneClass}`
    : `post-card-stat${toneClass}`;
}

function EngagementStat({
  icon,
  count,
  label,
  actionLabel,
  onActivate,
  className,
  disabled,
  ariaPressed,
  tone,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  actionLabel?: string;
  onActivate?: () => void;
  className?: string;
  disabled?: boolean;
  ariaPressed?: boolean;
  tone?: 'reply' | 'quote';
}) {
  const countNode =
    count > 0 ? (
      <span className="post-card-engagement-count">{count}</span>
    ) : null;

  if (onActivate) {
    return (
      <button
        type="button"
        className={engagementStatClassName(tone, true, className)}
        disabled={disabled}
        aria-pressed={ariaPressed}
        aria-label={actionLabel ?? label}
        title={actionLabel ?? label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }}
      >
        {icon}
        {countNode}
      </button>
    );
  }

  return (
    <span
      className={engagementStatClassName(tone, false, className)}
      aria-label={`${count} ${label}`}
      title={label}
    >
      {icon}
      {countNode}
    </span>
  );
}

function PostCardBody({
  actionHref,
  relationContext,
  badges,
  text,
}: {
  actionHref?: string;
  relationContext: { verb: string; handle: string } | null;
  badges: string[];
  text: string;
}) {
  const body = (
    <>
      {relationContext ? (
        <span className="post-card-relation">
          {relationContext.verb}{' '}
          <span className="post-card-relation-handle">
            @{relationContext.handle}
          </span>
        </span>
      ) : null}
      {badges.length > 0 ? (
        <div className="post-card-badges">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      ) : null}
      <p className="post-card-body">{text || '…'}</p>
    </>
  );

  if (!actionHref) {
    return body;
  }

  return (
    <Link
      href={actionHref}
      className="post-card-open"
      scroll={false}
      aria-label="Open post"
    >
      {body}
    </Link>
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
  quotedHref,
  showRelationBadge = true,
  showChannel = false,
  engagement,
  reactionPending,
  onToggleReaction,
  onReply,
  onQuote,
}: PostCardProps) {
  const text = parsePostText(post.value);
  const fallback = fallbackLabel(post.accountId);
  const name = authorProfile?.displayName?.trim() || fallback;
  const badges = postBadges(post);
  const relationContext = showRelationBadge
    ? postRelationContext(post, Boolean(quotedPost))
    : null;
  const profileHref = portfolioPath(post.accountId);
  const cardClassName = `post-card animate-rise-in${className ? ` ${className}` : ''}`;

  return (
    <article className={cardClassName}>
      <Link
        href={profileHref}
        className="post-card-avatar-link"
        scroll={false}
        aria-label={`View ${name}'s profile`}
      >
        <ProfileAvatar
          src={authorProfile?.avatarUrl ?? null}
          fallbackInitial={name}
          size="lg"
          className="post-card-avatar"
        />
      </Link>
      <div className="post-card-copy">
        <header className="post-card-header">
          <PostIdentityMeta
            name={name}
            accountId={post.accountId}
            timestamp={post.blockTimestamp}
            authorHref={profileHref}
            timeHref={actionHref}
            channel={showChannel ? (post.channel ?? undefined) : undefined}
          />
        </header>
        <PostCardBody
          actionHref={actionHref}
          relationContext={relationContext}
          badges={badges}
          text={text}
        />
        {quotedPost ? (
          <QuotedPostInset
            post={quotedPost}
            authorProfile={quotedAuthorProfile}
            href={quotedHref}
          />
        ) : null}
        {engagement ? (
          <div className="post-card-engagement">
            <EngagementStat
              icon={<MessageRoundIcon aria-hidden />}
              count={engagement.replyCount}
              label="replies"
              tone="reply"
              actionLabel={onReply ? 'Reply to this post' : undefined}
              onActivate={onReply ? () => onReply(post) : undefined}
            />
            <EngagementStat
              icon={<RepeatIcon aria-hidden />}
              count={engagement.quoteCount}
              label="quotes"
              tone="quote"
              actionLabel={onQuote ? 'Quote this post' : undefined}
              onActivate={onQuote ? () => onQuote(post) : undefined}
            />
            {onToggleReaction ? (
              <EngagementStat
                icon={<ReactIcon filled={engagement.viewerReacted} />}
                count={engagement.reactionCount}
                label="reactions"
                className={`post-card-react${engagement.viewerReacted ? ' is-active' : ''}${reactionPending ? ' is-pending' : ''}`}
                disabled={reactionPending}
                ariaPressed={engagement.viewerReacted}
                actionLabel={
                  engagement.viewerReacted
                    ? 'Remove your reaction'
                    : 'React to this post'
                }
                onActivate={() => onToggleReaction(post)}
              />
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
    </article>
  );
}

export { postKey };
