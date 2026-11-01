'use client';

import { memo, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  BookmarkFillIcon,
  BookmarkIcon,
  CheckIcon,
  RocketFillIcon,
  RocketIcon,
  HeartFillIcon,
  HeartIcon,
  MessageRoundIcon,
  RepeatIcon,
  ShareIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { PostLikesSheet } from '@/components/panels/post-likes-sheet';
import { RollingNumber } from '@/components/ui/rolling-number';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { formatWritingLikeLabel } from '@/lib/article-post-payload';
import {
  isDaoStandingTarget,
  rememberDaoStandingTarget,
} from '@/lib/dao-standing-account';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { shareUrl } from '@/lib/share-url';
import {
  formatStandingActionError,
  isWalletUserCancellation,
} from '@/lib/wallet-errors';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';

export function PostPeekStandButton({
  accountId,
  name,
  authorProfile,
}: {
  accountId: string;
  name: string;
  authorProfile?: PostAuthorProfile;
}) {
  const { isConnected, connect } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, theyStandWithViewer } =
    useViewerRelationship(accountId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(accountId);
  const pending = isStandingPendingForTarget(accountId);
  const isDao = isDaoStandingTarget(accountId, authorProfile?.kind === 'dao');

  async function handleStandToggle() {
    if (pending) return;
    if (!isConnected) {
      await connect();
      return;
    }
    if (isBlockEitherWay(accountId)) {
      setTxResult({
        type: 'error',
        msg: 'Standing is unavailable while a block is in place.',
      });
      return;
    }
    if (isDao) rememberDaoStandingTarget(accountId);
    try {
      await updateStanding(
        {
          accountId,
          name: authorProfile?.displayName?.trim() || name || null,
          bio: null,
          avatarUrl: authorProfile?.avatarUrl ?? null,
          isDao: isDao || undefined,
          theyStandWithViewer,
        },
        !viewerStanding
      );
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg: formatStandingActionError(error),
      });
    }
  }

  return (
    <button
      type="button"
      className={`standing-action os-disabled-ink feed-photo-caption-stand group${
        viewerStanding ? ' is-standing' : ''
      }`}
      disabled={pending}
      onClick={() => void handleStandToggle()}
      aria-label={
        viewerStanding ? `Step back from ${name}` : `Stand with ${name}`
      }
    >
      <StandingToggle active={viewerStanding} pending={pending} />
    </button>
  );
}

function ReactIcon({ filled }: { filled: boolean }) {
  return filled ? <HeartFillIcon aria-hidden /> : <HeartIcon aria-hidden />;
}

function AmplifyIcon({ filled }: { filled: boolean }) {
  return filled ? <RocketFillIcon aria-hidden /> : <RocketIcon aria-hidden />;
}

function BookmarkGlyph({ filled }: { filled: boolean }) {
  return filled ? (
    <BookmarkFillIcon aria-hidden />
  ) : (
    <BookmarkIcon aria-hidden />
  );
}

function absolutePostUrl(href: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return null;
  }
}

function PostShareControl({
  href,
  title,
}: {
  href: string;
  title?: string | null;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [copied, setCopied] = useState(false);
  const label = title?.trim() || 'post';

  return (
    <button
      type="button"
      className={`post-card-stat post-card-stat-button post-card-share${
        copied ? ' is-copied' : ''
      }`}
      aria-label={copied ? 'Link copied' : 'Share this post'}
      title={copied ? 'Link copied' : 'Share'}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const url = absolutePostUrl(href);
        if (!url) return;
        void (async () => {
          const result = await shareUrl({
            url,
            title: label,
            text: `Check out this post on OnSocial`,
          });
          if (result === 'copied') {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
            return;
          }
          if (result === 'failed') {
            setTxResult({
              type: 'error',
              msg: 'Couldn’t share this post.',
            });
          }
        })();
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <ShareIcon aria-hidden />}
    </button>
  );
}

function engagementStatClassName(
  tone: 'reply' | 'quote' | 'amplify' | undefined,
  interactive: boolean,
  className?: string
) {
  const toneClass =
    tone === 'reply'
      ? ' post-card-stat--reply'
      : tone === 'quote'
        ? ' post-card-stat--quote'
        : tone === 'amplify'
          ? ' post-card-stat--amplify'
          : '';
  const base = interactive
    ? `post-card-stat post-card-stat-button${toneClass}`
    : `post-card-stat${toneClass}`;
  return className ? `${base} ${className}` : base;
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
  rollSignal = 0,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  actionLabel?: string;
  onActivate?: () => void;
  className?: string;
  disabled?: boolean;
  ariaPressed?: boolean;
  tone?: 'reply' | 'quote' | 'amplify';
  /** Bumps when the viewer's own action confirms this count. */
  rollSignal?: number;
}) {
  const countNode = (
    <span className={`post-card-count-slot${count > 0 ? ' is-visible' : ''}`}>
      <RollingNumber value={count} rollSignal={rollSignal} />
    </span>
  );

  if (onActivate) {
    return (
      <button
        type="button"
        className={engagementStatClassName(tone, true, className)}
        disabled={disabled}
        aria-pressed={ariaPressed}
        aria-label={actionLabel ?? label}
        title={actionLabel ?? label}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
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

/** Engagement data + actions every row on the card shares from the shell. */
export type PostEngagementRowBaseProps = {
  engagement: PostEngagement;
  post: PostRow;
  reactionPending?: boolean;
  savePending?: boolean;
  sharePending?: boolean;
  onReply?: (post: PostRow) => void;
  onQuote?: (post: PostRow) => void;
  onRepost?: (post: PostRow) => void;
  onUndoRepost?: (post: PostRow) => void;
  onToggleReaction?: (post: PostRow) => void;
  onToggleSave?: (post: PostRow) => void;
};

export const PostEngagementRow = memo(function PostEngagementRow({
  engagement,
  shareHref,
  shareTitle,
  reactionPending,
  savePending,
  sharePending,
  onReply,
  onQuote,
  onRepost,
  onUndoRepost,
  onToggleReaction,
  onToggleSave,
  onAmplify,
  shareDrawerZIndex,
  post,
}: PostEngagementRowBaseProps & {
  shareHref: string;
  shareTitle?: string | null;
  onAmplify: () => void;
  /** Quote / repost drawer — raise when this row sits on an OS enlarge. */
  shareDrawerZIndex?: number;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const { accountId: viewerAccountId } = useAppWallet();
  const likeLabel = formatWritingLikeLabel(engagement.reactionCount);
  const canShare = Boolean(onQuote || onRepost || onUndoRepost);
  const closeShare = () => setShareOpen(false);
  const shareCount =
    (engagement.repostCount ?? 0) + (engagement.quoteCount ?? 0);
  const shareItems = useMemo<ActionDrawerItem[]>(() => {
    const items: ActionDrawerItem[] = [];
    if (
      engagement.viewerReposted &&
      onUndoRepost &&
      engagement.viewerRepostId
    ) {
      items.push({
        id: 'unrepost',
        label: 'Undo repost',
        description: 'Remove from your feed',
        leading: <RepeatIcon className="os-action-drawer-icon" aria-hidden />,
        disabled: sharePending,
        onSelect: () => {
          closeShare();
          onUndoRepost(post);
        },
      });
    } else if (onRepost && !engagement.viewerReposted) {
      items.push({
        id: 'repost',
        label: 'Repost',
        description: post.groupId
          ? 'Share in this guild'
          : 'Share to your feed',
        leading: <RepeatIcon className="os-action-drawer-icon" aria-hidden />,
        disabled: sharePending,
        onSelect: () => {
          closeShare();
          onRepost(post);
        },
      });
    }
    if (onQuote) {
      items.push({
        id: 'quote',
        label: 'Quote',
        description: 'Add a comment',
        leading: (
          <MessageRoundIcon className="os-action-drawer-icon" aria-hidden />
        ),
        onSelect: () => {
          closeShare();
          onQuote(post);
        },
      });
    }
    return items;
  }, [
    engagement.viewerReposted,
    engagement.viewerRepostId,
    onQuote,
    onRepost,
    onUndoRepost,
    post,
    sharePending,
  ]);

  return (
    <div className="post-card-engagement">
      <div className="post-card-engagement-actions">
        <EngagementStat
          icon={<MessageRoundIcon aria-hidden />}
          count={engagement.replyCount}
          rollSignal={engagement.replyRoll}
          label="replies"
          tone="reply"
          actionLabel={onReply ? 'Reply to this post' : undefined}
          onActivate={onReply ? () => onReply(post) : undefined}
        />
        <EngagementStat
          icon={<RepeatIcon aria-hidden />}
          count={shareCount}
          rollSignal={engagement.shareRoll}
          label="shares"
          tone="quote"
          className={`os-confirm-icon${
            engagement.viewerReposted && !sharePending ? ' is-active' : ''
          }${sharePending ? ' is-pending' : ''}`}
          disabled={sharePending}
          ariaPressed={
            sharePending ? undefined : engagement.viewerReposted || undefined
          }
          actionLabel={
            sharePending
              ? 'Confirming share'
              : canShare
                ? engagement.viewerReposted
                  ? 'Undo repost or quote'
                  : 'Quote or repost'
                : undefined
          }
          onActivate={
            canShare && !sharePending ? () => setShareOpen(true) : undefined
          }
        />
        <span
          className={`post-card-react-cluster post-card-react${
            engagement.viewerReacted ? ' is-active' : ''
          }`}
        >
          {onToggleReaction ? (
            <button
              type="button"
              className={`os-confirm-icon post-card-react-heart${
                reactionPending ? ' is-pending' : ''
              }`}
              disabled={reactionPending}
              aria-pressed={engagement.viewerReacted}
              aria-label={
                engagement.viewerReacted
                  ? 'Remove your reaction'
                  : 'React to this post'
              }
              title={engagement.viewerReacted ? 'Liked' : 'Like'}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleReaction(post);
              }}
            >
              <ReactIcon filled={engagement.viewerReacted} />
            </button>
          ) : (
            <span className="post-card-react-heart" aria-hidden>
              <ReactIcon filled={false} />
            </span>
          )}
          <button
            type="button"
            className={`post-card-like-count${likeLabel ? '' : ' is-idle'}`}
            aria-label={likeLabel ? `View who liked — ${likeLabel}` : undefined}
            aria-hidden={likeLabel ? undefined : true}
            tabIndex={likeLabel ? undefined : -1}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              if (!likeLabel) return;
              event.preventDefault();
              event.stopPropagation();
              setLikesOpen(true);
            }}
          >
            <RollingNumber
              value={engagement.reactionCount}
              rollSignal={engagement.reactionRoll}
            />
          </button>
        </span>
        <EngagementStat
          icon={<AmplifyIcon filled={engagement.viewerAmplified} />}
          count={engagement.amplifyCount}
          rollSignal={engagement.amplifyRoll}
          label="amplifies"
          tone="amplify"
          className={`post-card-amplify${engagement.viewerAmplified ? ' is-active' : ''}`}
          ariaPressed={engagement.viewerAmplified}
          actionLabel={
            engagement.viewerAmplified ? 'Amplify again' : 'Amplify this post'
          }
          onActivate={onAmplify}
        />
      </div>
      <div className="post-card-engagement-trailing">
        {onToggleSave ? (
          <button
            type="button"
            className={`os-confirm-icon post-card-stat post-card-stat-button post-card-save${
              engagement.viewerSaved ? ' is-active' : ''
            }${savePending ? ' is-pending' : ''}`}
            disabled={savePending}
            aria-pressed={engagement.viewerSaved}
            aria-label={
              engagement.viewerSaved ? 'Remove from saved' : 'Save this post'
            }
            title={engagement.viewerSaved ? 'Saved' : 'Save'}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSave(post);
            }}
          >
            <BookmarkGlyph filled={engagement.viewerSaved} />
          </button>
        ) : null}
        <PostShareControl href={shareHref} title={shareTitle} />
      </div>
      <PostLikesSheet
        open={likesOpen}
        onClose={() => setLikesOpen(false)}
        postOwner={post.accountId}
        postId={post.postId}
        groupId={post.groupId}
        likeCount={engagement.reactionCount}
        viewerAccountId={viewerAccountId}
        viewerLiked={!reactionPending && engagement.viewerReacted}
        {...(shareDrawerZIndex != null ? { zIndex: shareDrawerZIndex } : {})}
      />
      {canShare ? (
        <ActionDrawer
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          label="Quote or repost"
          items={shareItems}
          {...(shareDrawerZIndex != null ? { zIndex: shareDrawerZIndex } : {})}
        />
      ) : null}
    </div>
  );
});
