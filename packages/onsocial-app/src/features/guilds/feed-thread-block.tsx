'use client';

import { useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { PostCard, postKey } from '@/features/home/post-card';
import { ThreadFoldButton } from '@/features/home/thread-fold-button';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  EMPTY_POST_ENGAGEMENT,
  type PostEngagement,
} from '@/hooks/use-post-engagement';
import type { PollTally } from '@/lib/poll-votes';
import { postThreadPath } from '@/lib/post-routes';

/** Chains up to this long render in full; longer ones collapse the middle. */
const BLOCK_MAX_UNCOLLAPSED = 3;

/** Latest posts kept visible below the fold when a chain collapses. */
const BLOCK_TAIL_VISIBLE = 2;

interface FeedThreadBlockProps {
  /** Connected chain, oldest first (see `coalesceFeedThreads`). */
  block: PostRow[];
  /** When set, cards prefer this guild for thread links. */
  groupId?: string;
  showChannel?: boolean;
  /** Map post `channel` ids → room titles for the All feed. */
  channelTitleById?: Record<string, string>;
  /** Home / hashtag: show guild source above the author. */
  showGuildAttribution?: boolean;
  guildNameById?: Record<string, string>;
  postAuthorProfiles: Record<string, PostAuthorProfile>;
  quotedPosts: Record<string, PostRow>;
  engagement: Record<string, PostEngagement>;
  isReactionPending: (post: PostRow) => boolean;
  onToggleReaction: (post: PostRow) => void;
  onAmplifyConfirmed?: (
    post: PostRow,
    detail: PostAmplifySuccessDetail
  ) => void;
  pollTallyFor?: (post: PostRow) => PollTally | undefined;
  isPollVotePending?: (post: PostRow) => boolean;
  onPollVote?: (post: PostRow, optionIndex: number) => void;
  onReply?: (post: PostRow) => void;
  onQuote?: (post: PostRow) => void;
}

interface BlockRow {
  post: PostRow;
  /** Rail segment reaching up to the previous row. */
  up: boolean;
  /** Rail segment continuing down to the next row. */
  down: boolean;
  first: boolean;
}

function resolveThreadHref(
  post: PostRow,
  fallbackGroupId?: string
): string {
  return postThreadPath({
    accountId: post.accountId,
    postId: post.postId,
    groupId: post.groupId ?? fallbackGroupId,
  });
}

/**
 * A connected conversation block in a feed: root on top, self-replies
 * beneath, avatars joined by one rail. Works for guild and personal feeds.
 */
export function FeedThreadBlock({
  block,
  groupId,
  showChannel = false,
  channelTitleById,
  showGuildAttribution = false,
  guildNameById,
  postAuthorProfiles,
  quotedPosts,
  engagement,
  isReactionPending,
  onToggleReaction,
  onAmplifyConfirmed,
  pollTallyFor,
  isPollVotePending,
  onPollVote,
  onReply,
  onQuote,
}: FeedThreadBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = !expanded && block.length > BLOCK_MAX_UNCOLLAPSED;
  const hiddenCount = collapsed ? block.length - 1 - BLOCK_TAIL_VISIBLE : 0;

  const toRow = (
    post: PostRow,
    index: number,
    posts: PostRow[],
    options?: Partial<BlockRow>
  ): BlockRow => ({
    post,
    up: index > 0,
    down: index < posts.length - 1,
    first: index === 0,
    ...options,
  });

  const head: BlockRow[] = collapsed
    ? [{ post: block[0]!, up: false, down: true, first: true }]
    : block.map((post, index, posts) => toRow(post, index, posts));

  const tail: BlockRow[] = collapsed
    ? block
        .slice(-BLOCK_TAIL_VISIBLE)
        .map((post, index, posts) =>
          toRow(post, index, posts, { up: true, first: false })
        )
    : [];

  const renderRow = ({ post, up, down, first }: BlockRow) => {
    const itemClassName = [
      'post-thread-item',
      up ? 'post-thread-item--up post-thread-item--cont' : '',
      down ? 'post-thread-item--down' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const stats = engagement[postKey(post)] ?? EMPTY_POST_ENGAGEMENT;
    const quoted = post.refPath ? quotedPosts[post.refPath] : undefined;
    const actionHref = resolveThreadHref(post, groupId);
    const quotedHref = quoted
      ? resolveThreadHref(quoted, quoted.groupId ?? groupId)
      : undefined;

    return (
      <div key={postKey(post)} className={itemClassName}>
        <PostCard
          post={post}
          authorProfile={postAuthorProfiles[post.accountId]}
          actionHref={actionHref}
          showChannel={showChannel}
          channelLabel={
            showChannel && post.channel
              ? channelTitleById?.[post.channel] ?? post.channel
              : undefined
          }
          showGuildAttribution={showGuildAttribution}
          guildName={
            post.groupId ? guildNameById?.[post.groupId] : undefined
          }
          showRelationBadge={first}
          className={first ? undefined : 'post-card--chain-cont'}
          quotedPost={quoted}
          quotedAuthorProfile={
            quoted ? postAuthorProfiles[quoted.accountId] : undefined
          }
          quotedHref={quotedHref}
          engagement={stats}
          reactionPending={isReactionPending(post)}
          onToggleReaction={onToggleReaction}
          onAmplifyConfirmed={onAmplifyConfirmed}
          pollTally={pollTallyFor?.(post)}
          pollVotePending={isPollVotePending?.(post)}
          onPollVote={onPollVote}
          onReply={onReply}
          onQuote={onQuote}
        />
      </div>
    );
  };

  return (
    <div className="post-thread-block">
      {head.map(renderRow)}
      {collapsed ? (
        <ThreadFoldButton onClick={() => setExpanded(true)}>
          {hiddenCount === 1
            ? 'Show 1 earlier post in thread'
            : `Show ${hiddenCount} earlier posts in thread`}
        </ThreadFoldButton>
      ) : null}
      {tail.map(renderRow)}
    </div>
  );
}
