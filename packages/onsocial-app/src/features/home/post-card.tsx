'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  Divider,
  DotsVerticalIcon,
  FloatingPanelMenu,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  ProfileAvatar,
  RepeatIcon,
  UsersFillIcon,
  osFloatingPanelBodyClassName,
  osFloatingPanelItemClassName,
  useDropdown,
} from '@onsocial/ui';
import { guildPath } from '@/features/guilds/guilds-data';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { PostMediaStrip } from '@/features/home/post-media';
import { PostPollEmbedCard } from '@/features/home/post-poll-embed';
import { PostRichText } from '@/features/home/post-rich-text';
import {
  parsePostPollEmbed,
  parsePostText,
  postFeedPreviewLimit,
  postKey,
  postPreviewNeedsExpand,
  truncatePostPreview,
} from '@/lib/post-display';
import {
  parsePostMedia,
  isRenderablePostVideoMime,
  appendPostMediaIndex,
  appendPostMediaUnmute,
  formatMediaDuration,
  truncateQuoteText,
  type PostMediaItem,
} from '@/lib/post-media';
import type { PollTally } from '@/lib/poll-votes';
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
  /** Show room under identity (guild “All” / thread root). */
  showChannel?: boolean;
  /** Prefer room title when `channel` is an id. */
  channelLabel?: string;
  /**
   * Mixed feeds (Home / hashtag): muted Users + guild name above the author.
   * Skip inside a guild room where context is already the guild.
   */
  showGuildAttribution?: boolean;
  /** Resolved guild display name when `showGuildAttribution` is on. */
  guildName?: string;
  engagement?: PostEngagement;
  reactionPending?: boolean;
  onToggleReaction?: (post: PostRow) => void;
  /** Open a reply composer targeting this post. */
  onReply?: (post: PostRow) => void;
  /** Open a quote composer targeting this post. */
  onQuote?: (post: PostRow) => void;
  pollTally?: PollTally;
  pollVotePending?: boolean;
  onPollVote?: (post: PostRow, optionIndex: number) => void;
  /** Thread root — page-sized focused media playback. */
  mediaFocused?: boolean;
  /** Detail opened with `?media=unmute` — resume video with sound. */
  mediaUnmuted?: boolean;
  /** Collage tile index to unmute (`?mi=`). */
  mediaResumeIndex?: number;
}

function PostCardMenu({ href }: { href?: string }) {
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();

  // No actions yet without a permalink — don't render an empty ⋮ menu.
  if (!href) return null;

  const copyLink = async () => {
    if (typeof window === 'undefined') return;
    const url = new URL(href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can fail in insecure contexts — still close the menu.
    }
    close();
  };

  return (
    <div
      className={`post-card-menu${isOpen ? ' is-open' : ''}`}
      ref={containerRef}
    >
      <button
        type="button"
        className={`post-card-menu-trigger${isOpen ? ' is-open' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Post options"
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>

      <FloatingPanelMenu
        ref={panelRef}
        open={isOpen}
        align="right"
        offset="sm"
        className="post-card-menu-panel"
        role="menu"
        aria-label="Post options"
      >
        <div className={osFloatingPanelBodyClassName}>
          <button
            type="button"
            role="menuitem"
            className={osFloatingPanelItemClassName}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void copyLink();
            }}
          >
            <span>Copy link</span>
          </button>
        </div>
      </FloatingPanelMenu>
    </div>
  );
}

function postBadges(
  post: PostRow,
  hasPollEmbed: boolean,
  _hasMediaStrip: boolean
): string[] {
  const kind = post.kind;
  // Media speaks for itself — never badge image/video/audio.
  // Polls render their own card; skip the redundant "poll" pill.
  const hideKind =
    kind === 'text' ||
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    (hasPollEmbed && kind === 'poll');
  return [hideKind ? null : kind].filter(
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
  const text = truncateQuoteText(parsePostText(post.value));
  const mediaItems = parsePostMedia(post.value).slice(0, 4);
  const thumb = mediaItems.length === 1 ? mediaItems[0] : null;
  const collage = mediaItems.length > 1 ? mediaItems : null;
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
        {thumb || collage || text ? (
          <div
            className={[
              'post-card-quote-inset-body-row',
              thumb ? 'has-media' : '',
              collage ? 'is-stacked' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* Multi: text above mini-collage. Single: thumb beside text. */}
            {collage && text ? (
              <p className="post-card-quote-inset-body">
                <PostRichText text={text} />
              </p>
            ) : null}
            {collage ? (
              <PostMediaStrip
                items={collage}
                size="quote"
                playbackDisabled
              />
            ) : null}
            {thumb ? <QuoteMediaThumb item={thumb} /> : null}
            {!collage && text ? (
              <p className="post-card-quote-inset-body">
                <PostRichText text={text} />
              </p>
            ) : null}
          </div>
        ) : (
          <p className="post-card-quote-inset-body">…</p>
        )}
      </div>
    </div>
  );
}

function QuoteMediaThumb({ item }: { item: PostMediaItem }) {
  const isVideo = isRenderablePostVideoMime(item.mime);
  const [durationByUrl, setDurationByUrl] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const durationLabel =
    isVideo && durationByUrl?.url === item.url ? durationByUrl.label : '';

  useEffect(() => {
    if (!isVideo) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (cancelled) return;
      setDurationByUrl({
        url: item.url,
        label: formatMediaDuration(video.duration),
      });
    };
    video.onerror = () => {
      if (!cancelled) setDurationByUrl({ url: item.url, label: '' });
    };
    video.src = item.url;
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [isVideo, item.url]);

  return (
    <div className="post-card-quote-thumb" aria-hidden>
      {isVideo ? (
        <video
          src={item.url}
          muted
          playsInline
          preload="metadata"
          className="post-card-quote-thumb-media"
        />
      ) : (
        <img
          src={item.url}
          alt=""
          className="post-card-quote-thumb-media"
          loading="lazy"
          decoding="async"
        />
      )}
      {durationLabel ? (
        <span className="post-card-quote-thumb-duration">{durationLabel}</span>
      ) : null}
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
  relationContext,
  badges,
  text,
  hideText = false,
  hasMedia = false,
  /** Thread focus / detail — show full copy, no Show more. */
  expandDisabled = false,
}: {
  relationContext: { verb: string; handle: string } | null;
  badges: string[];
  text: string;
  /** When the poll card already shows the question, skip duplicate body text. */
  hideText?: boolean;
  hasMedia?: boolean;
  expandDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewLimit = postFeedPreviewLimit(hasMedia);
  const canExpand =
    !expandDisabled && !hideText && postPreviewNeedsExpand(text, previewLimit);
  const bodyText =
    canExpand && !expanded ? truncatePostPreview(text, previewLimit) : text;

  return (
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
      {!hideText ? (
        <div className="post-card-body-block">
          <p className="post-card-body">
            <PostRichText text={bodyText} />
          </p>
          {canExpand ? (
            <button
              type="button"
              className="post-card-show-more"
              aria-expanded={expanded}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
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
  channelLabel,
  showGuildAttribution = false,
  guildName,
  engagement,
  reactionPending,
  onToggleReaction,
  onReply,
  onQuote,
  pollTally,
  pollVotePending,
  onPollVote,
  mediaFocused = false,
  mediaUnmuted = false,
  mediaResumeIndex = 0,
}: PostCardProps) {
  const router = useRouter();
  const text = parsePostText(post.value);
  const poll = parsePostPollEmbed(post.value);
  const mediaItems = parsePostMedia(post.value);
  const hasMedia = mediaItems.length > 0;
  const fallback = fallbackLabel(post.accountId);
  const name = authorProfile?.displayName?.trim() || fallback;
  const badges = postBadges(post, Boolean(poll), mediaItems.length > 0);
  const relationContext = showRelationBadge
    ? postRelationContext(post, Boolean(quotedPost))
    : null;
  const profileHref = portfolioPath(post.accountId);
  const guildId = post.groupId?.trim() || null;
  const guildLabel =
    showGuildAttribution && guildId
      ? guildName?.trim() || guildId
      : null;
  const guildHref = guildId ? guildPath(guildId) : null;
  const cardClassName = [
    'post-card',
    'animate-rise-in',
    actionHref ? 'post-card--openable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClassName}>
      {actionHref ? (
        <Link
          href={actionHref}
          className="post-card-hit"
          scroll={false}
          aria-label="Open post"
        />
      ) : null}
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
          <div className="post-card-header-stack">
            {guildLabel && guildHref ? (
              <Link
                href={guildHref}
                className="post-card-guild"
                scroll={false}
                onClick={(event) => event.stopPropagation()}
              >
                <UsersFillIcon className="post-card-guild-icon" aria-hidden />
                <span className="post-card-guild-name">{guildLabel}</span>
              </Link>
            ) : null}
            <PostIdentityMeta
              name={name}
              accountId={post.accountId}
              timestamp={post.blockTimestamp}
              authorHref={profileHref}
              timeHref={actionHref}
              channel={
                showChannel
                  ? channelLabel?.trim() || post.channel || undefined
                  : undefined
              }
              trailing={<PostCardMenu href={actionHref} />}
            />
          </div>
        </header>
        <PostCardBody
          relationContext={relationContext}
          badges={badges}
          text={text}
          hasMedia={hasMedia}
          expandDisabled={mediaFocused}
          hideText={
            (Boolean(poll) && text === poll?.question) ||
            (mediaItems.length > 0 && !text.trim())
          }
        />
        {poll ? (
          <PostPollEmbedCard
            poll={poll}
            tally={pollTally}
            pending={pollVotePending}
            onVote={
              onPollVote
                ? (optionIndex) => onPollVote(post, optionIndex)
                : undefined
            }
          />
        ) : null}
        {mediaItems.length > 0 ? (
          <PostMediaStrip
            items={mediaItems}
            size={mediaFocused ? 'page' : 'compact'}
            focused={mediaFocused}
            focusedVideoMuted={!mediaUnmuted}
            resumeFocusedVideo={mediaUnmuted}
            resumeMediaIndex={mediaResumeIndex}
            onActivate={
              !mediaFocused && actionHref && hasMedia
                ? (index) => {
                    const item = mediaItems[index];
                    const unmute = Boolean(
                      item && isRenderablePostVideoMime(item.mime)
                    );
                    router.push(
                      unmute
                        ? appendPostMediaUnmute(actionHref, index)
                        : appendPostMediaIndex(actionHref, index)
                    );
                  }
                : undefined
            }
          />
        ) : null}
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
