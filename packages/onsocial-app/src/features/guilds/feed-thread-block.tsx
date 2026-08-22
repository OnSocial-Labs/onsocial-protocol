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
import { parsePostText } from '@/lib/post-display';
import { isRepostRefType } from '@/lib/post-relation';
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
  isSavePending?: (post: PostRow) => boolean;
  isSharePending?: (post: PostRow) => boolean;
  onToggleReaction: (post: PostRow) => void;
  onToggleSave?: (post: PostRow) => void;
  onAmplifyConfirmed?: (
    post: PostRow,
    detail: PostAmplifySuccessDetail
  ) => void;
  pollTallyFor?: (post: PostRow) => PollTally | undefined;
  isPollVotePending?: (post: PostRow) => boolean;
  onPollVote?: (post: PostRow, optionIndex: number) => void;
  onReply?: (post: PostRow) => void;
  onQuote?: (post: PostRow) => void;
  onRepost?: (post: PostRow) => void;
  onUndoRepost?: (post: PostRow) => void;
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
  isSavePending,
  isSharePending,
  onToggleReaction,
  onToggleSave,
  onAmplifyConfirmed,
  pollTallyFor,
  isPollVotePending,
  onPollVote,
  onReply,
  onQuote,
  onRepost,
  onUndoRepost,
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

    const rawQuoted = post.refPath ? quotedPosts[post.refPath] : undefined;
    // Bare repost shell + resolved original → render the ORIGINAL as the
    // card (its author, time, engagement, actions) with a `{name} reposted`
    // attribution line on top. Falls back to the shell while loading.
    const repostOriginal =
      isRepostRefType(post.refType) && !parsePostText(post.value).trim()
        ? rawQuoted
        : undefined;
    const card = repostOriginal ?? post;
    const quoted = repostOriginal
      ? card.refPath
        ? quotedPosts[card.refPath]
        : undefined
      : rawQuoted;
    const actionHref = resolveThreadHref(card, groupId);
    const quotedHref = quoted
      ? resolveThreadHref(quoted, quoted.groupId ?? groupId)
      : undefined;
    const stats = engagement[postKey(card)] ?? EMPTY_POST_ENGAGEMENT;

    return (
      <div key={postKey(post)} className={itemClassName}>
        <PostCard
          post={card}
          authorProfile={postAuthorProfiles[card.accountId]}
          repostedBy={
            repostOriginal
              ? {
                  accountId: post.accountId,
                  displayName:
                    postAuthorProfiles[post.accountId]?.displayName,
                }
              : undefined
          }
          actionHref={actionHref}
          showChannel={showChannel}
          channelLabel={
            showChannel && card.channel
              ? channelTitleById?.[card.channel] ?? card.channel
              : undefined
          }
          showGuildAttribution={showGuildAttribution}
          guildName={
            card.groupId ? guildNameById?.[card.groupId] : undefined
          }
          showRelationBadge={first}
          className={first ? undefined : 'post-card--chain-cont'}
          quotedPost={quoted}
          quotedAuthorProfile={
            quoted ? postAuthorProfiles[quoted.accountId] : undefined
          }
          quotedHref={quotedHref}
          engagement={stats}
          reactionPending={isReactionPending(card)}
          savePending={isSavePending?.(card)}
          sharePending={isSharePending?.(card)}
          onToggleReaction={onToggleReaction}
          onToggleSave={onToggleSave}
          onAmplifyConfirmed={onAmplifyConfirmed}
          pollTally={pollTallyFor?.(card)}
          pollVotePending={isPollVotePending?.(card)}
          onPollVote={onPollVote}
          onReply={onReply}
          onQuote={onQuote}
          onRepost={onRepost}
          onUndoRepost={onUndoRepost}
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
