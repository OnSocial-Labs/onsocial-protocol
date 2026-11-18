'use client';

import type { ComponentProps } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { PostCard, postKey } from '@/features/home/post-card';
import { PostRowSkeleton } from '@/features/home/post-skeleton';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  EMPTY_POST_ENGAGEMENT,
  type PostEngagement,
} from '@/hooks/use-post-engagement';
import { resolveFeedRepostCard } from '@/lib/feed-repost-card';
import type { PollTally } from '@/lib/poll-votes';
import { displayName } from '@/lib/profile-display';

type PostCardProps = ComponentProps<typeof PostCard>;

/**
 * Feed / thread PostCard with bare-repost Structure→Paint: attribution +
 * text chassis until the original resolves, then the original as the card.
 */
export function ResolvedFeedPostCard({
  post,
  quotedPosts,
  postAuthorProfiles,
  hrefForPost,
  engagement,
  isReactionPending,
  isSavePending,
  isSharePending,
  pollTallyFor,
  isPollVotePending,
  quoteSettled,
  channelTitleById,
  guildNameById,
  showChannel,
  showGuildAttribution,
  guildName,
  channelLabel,
  ...rest
}: {
  post: PostRow;
  quotedPosts: Record<string, PostRow>;
  postAuthorProfiles: Record<string, PostAuthorProfile>;
  /** Thread / quote href for the painted card (and its inset). */
  hrefForPost: (post: PostRow) => string | undefined;
  engagement: Record<string, PostEngagement>;
  isReactionPending: (post: PostRow) => boolean;
  isSavePending?: (post: PostRow) => boolean;
  isSharePending?: (post: PostRow) => boolean;
  pollTallyFor?: (post: PostRow) => PollTally | undefined;
  isPollVotePending?: (post: PostRow) => boolean;
  quoteSettled?: (post: PostRow) => boolean;
  /** Prefer maps so labels follow the painted card after bare-repost swap. */
  channelTitleById?: Record<string, string>;
  guildNameById?: Record<string, string>;
} & Omit<
  PostCardProps,
  | 'post'
  | 'authorProfile'
  | 'quotedPost'
  | 'quotedAuthorProfile'
  | 'quotedHref'
  | 'repostedBy'
  | 'actionHref'
  | 'engagement'
  | 'reactionPending'
  | 'savePending'
  | 'sharePending'
  | 'pollTally'
  | 'pollVotePending'
  | 'quoteSettled'
>) {
  const resolved = resolveFeedRepostCard(post, quotedPosts, postAuthorProfiles);
  if (resolved.pending) {
    const reposter = displayName(
      post.accountId,
      postAuthorProfiles[post.accountId]?.displayName
    );
    return (
      <div className="post-card-pending-repost" aria-busy="true">
        <span className="post-card-repost-line" aria-hidden>
          {`${reposter} reposted`}
        </span>
        {/* Text chassis matches feedBlockEstimatePx for unresolved shells. */}
        <PostRowSkeleton rows={1} />
      </div>
    );
  }
  const { card, quoted, repostedBy } = resolved;
  const resolvedChannelLabel =
    channelLabel ??
    (showChannel && card.channel
      ? (channelTitleById?.[card.channel] ?? card.channel)
      : undefined);
  const resolvedGuildName =
    guildName ?? (card.groupId ? guildNameById?.[card.groupId] : undefined);
  return (
    <PostCard
      {...rest}
      post={card}
      authorProfile={postAuthorProfiles[card.accountId]}
      repostedBy={repostedBy}
      actionHref={hrefForPost(card)}
      showChannel={showChannel}
      showGuildAttribution={showGuildAttribution}
      channelLabel={resolvedChannelLabel}
      guildName={resolvedGuildName}
      quotedPost={quoted}
      quotedAuthorProfile={
        quoted ? postAuthorProfiles[quoted.accountId] : undefined
      }
      quotedHref={quoted ? hrefForPost(quoted) : undefined}
      engagement={engagement[postKey(card)] ?? EMPTY_POST_ENGAGEMENT}
      reactionPending={isReactionPending(card)}
      savePending={isSavePending?.(card)}
      sharePending={isSharePending?.(card)}
      pollTally={pollTallyFor?.(card)}
      pollVotePending={isPollVotePending?.(card)}
      {...(quoteSettled ? { quoteSettled: quoteSettled(card) } : {})}
    />
  );
}
