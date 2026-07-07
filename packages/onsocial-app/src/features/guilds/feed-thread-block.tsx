'use client';

import { useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { PostCard, postKey } from '@/features/home/post-card';
import { guildPostPath } from '@/features/guilds/guilds-data';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import type { PostEngagement } from '@/hooks/use-post-engagement';

/** Chains up to this long render in full; longer ones collapse the middle. */
const BLOCK_MAX_UNCOLLAPSED = 3;

/** Latest posts kept visible below the fold when a chain collapses. */
const BLOCK_TAIL_VISIBLE = 2;

interface FeedThreadBlockProps {
  /** Connected chain, oldest first (see `coalesceFeedThreads`). */
  block: PostRow[];
  groupId: string;
  showChannel: boolean;
  postAuthorProfiles: Record<string, PostAuthorProfile>;
  quotedPosts: Record<string, PostRow>;
  engagement: Record<string, PostEngagement>;
  isReactionPending: (post: PostRow) => boolean;
  onToggleReaction: (post: PostRow) => void;
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

/**
 * A connected conversation block in the guild feed: root on top, replies
 * beneath, avatars joined by one rail. Long chains keep the root (context)
 * and the latest `BLOCK_TAIL_VISIBLE` posts (recency); the middle folds
 * behind a dotted `Show N more` row that expands in place.
 */
export function FeedThreadBlock({
  block,
  groupId,
  showChannel,
  postAuthorProfiles,
  quotedPosts,
  engagement,
  isReactionPending,
  onToggleReaction,
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

  // Tail rows stay chained: up into the dotted fold, down between each other.
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

    // The author's continuation is already drawn below this row — count only
    // replies from others next to the comment icon.
    const isContinued = post !== block[block.length - 1];
    const stats = engagement[postKey(post)];
    const adjustedStats =
      stats && isContinued
        ? { ...stats, replyCount: Math.max(0, stats.replyCount - 1) }
        : stats;

    const quoted = post.refPath ? quotedPosts[post.refPath] : undefined;

    return (
      <div key={postKey(post)} className={itemClassName}>
        <PostCard
          post={post}
          authorProfile={postAuthorProfiles[post.accountId]}
          actionHref={guildPostPath(groupId, post.accountId, post.postId)}
          showChannel={showChannel}
          // Continuations are drawn with the rail, not labeled.
          showRelationBadge={first}
          className={first ? undefined : 'post-card--chain-cont'}
          quotedPost={quoted}
          quotedAuthorProfile={
            quoted ? postAuthorProfiles[quoted.accountId] : undefined
          }
          quotedHref={
            quoted
              ? guildPostPath(
                  quoted.groupId ?? groupId,
                  quoted.accountId,
                  quoted.postId
                )
              : undefined
          }
          engagement={adjustedStats}
          reactionPending={isReactionPending(post)}
          onToggleReaction={onToggleReaction}
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
        <button
          type="button"
          className="post-thread-more"
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} more
        </button>
      ) : null}
      {tail.map(renderRow)}
    </div>
  );
}
