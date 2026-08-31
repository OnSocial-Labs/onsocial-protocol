'use client';

import { useEffect, useMemo } from 'react';
import { Divider } from '@onsocial/ui';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { postContentPath } from '@onsocial/sdk';
import { FeedThreadBlock } from '@/features/guilds/feed-thread-block';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { postKey } from '@/features/home/post-card';
import type { PersonalPostSubmitResult } from '@/features/home/submit-personal-post';
import type { WriteDockSubmit } from '@/contexts/compose-launcher-context';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
import { subscribePersonalReplyConfirmed } from '@/features/scarces/drop-compose-host';
import {
  seedPostAuthorProfilesFromFeed,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
import {
  seedGuildDisplayNamesFromFeed,
  useGuildDisplayNames,
} from '@/hooks/use-guild-display-names';
import {
  usePostEngagement,
  type PostEngagement,
} from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useQuotedPosts } from '@/hooks/use-quoted-posts';
import type { AmplifySuccessDetail } from '@/lib/amplify-heat';
import { coalesceFeedThreads } from '@/lib/feed-threads';
import {
  withRepostOriginals,
  collectRelationTargetAccountIds,
} from '@/lib/post-relation';

interface PersonalFeedListProps {
  posts: PostRow[];
  onReply?: (post: PostRow) => void;
  onExpandReply?: (post: PostRow, draft: WriteDockSubmit) => void;
  onQuote?: (post: PostRow) => void;
  onRepost?: (post: PostRow) => void | Promise<PersonalPostSubmitResult | void>;
  onUndoRepost?: (
    post: PostRow,
    viewerRepost: { postId: string; groupId?: string | null }
  ) => void | Promise<PersonalPostSubmitResult | void>;
  /** After amplify tx confirms — parent may optimistic Hot re-rank. */
  onAmplified?: (post: PostRow, detail: AmplifySuccessDetail) => void;
  onEngagementError?: (message: string) => void;
  className?: string;
  /** Hashtag results include replies to other people. */
  includeForeignReplies?: boolean;
  /** Standing lens — show foreign replies from these authors. */
  stoodWithAccountIds?: ReadonlySet<string>;
  /** Home / hashtag mixed feed — guild source chip on group posts. */
  showGuildAttribution?: boolean;
  /** SSR engagement seed — counts on first paint. */
  initialEngagement?: Record<string, PostEngagement> | null;
  /** SSR scarce CTA seed — Buy/Bid without IntersectionObserver wait. */
  initialScarceEmbeds?: Record<string, PostScarceEmbed> | null;
}

/** Shared home/profile feed rendering — thread blocks + quote insets + polls. */
export function PersonalFeedList({
  posts,
  onReply,
  onExpandReply,
  onQuote,
  onRepost,
  onUndoRepost,
  onAmplified,
  onEngagementError,
  className,
  includeForeignReplies = false,
  stoodWithAccountIds,
  showGuildAttribution = false,
  initialEngagement = null,
  initialScarceEmbeds = null,
}: PersonalFeedListProps) {
  seedPostAuthorProfilesFromFeed(posts);
  seedGuildDisplayNamesFromFeed(posts);
  seedScarceEmbedsFromSsr(initialScarceEmbeds);

  const feedBlocks = useMemo(
    () =>
      coalesceFeedThreads(posts, {
        includeForeignReplies,
        stoodWithAccountIds,
      }),
    [includeForeignReplies, posts, stoodWithAccountIds]
  );
  const quotedPosts = useQuotedPosts(posts);
  seedPostAuthorProfilesFromFeed(Object.values(quotedPosts));
  seedGuildDisplayNamesFromFeed(Object.values(quotedPosts));

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const post of posts) ids.add(post.accountId);
    for (const quoted of Object.values(quotedPosts)) {
      ids.add(quoted.accountId);
    }
    for (const targetId of collectRelationTargetAccountIds(posts)) {
      ids.add(targetId);
    }
    for (const targetId of collectRelationTargetAccountIds(
      Object.values(quotedPosts)
    )) {
      ids.add(targetId);
    }
    return Array.from(ids);
  }, [posts, quotedPosts]);

  const guildIds = useMemo(() => {
    if (!showGuildAttribution) return [];
    const ids = new Set<string>();
    for (const post of posts) {
      if (post.groupId) ids.add(post.groupId);
    }
    return Array.from(ids);
  }, [posts, showGuildAttribution]);

  const postAuthorProfiles = usePostAuthorProfiles(authorIds);
  const guildNameById = useGuildDisplayNames(guildIds);
  // Repost rows render (and act on) the original post — engagement and poll
  // tallies both key on the original, so both hooks need the expanded list.
  const engagementPosts = useMemo(
    () => withRepostOriginals(posts, quotedPosts),
    [posts, quotedPosts]
  );
  const {
    engagement,
    toggleReaction,
    toggleSave,
    isReactionPending,
    isSavePending,
    isSharePending,
    withSharePending,
    confirmAmplify,
    confirmRepost,
    confirmUnrepost,
    confirmReply,
  } = usePostEngagement(engagementPosts, {
    initial: initialEngagement,
    onError: onEngagementError,
  });
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    engagementPosts,
    {
      onError: onEngagementError,
    }
  );

  useEffect(() => {
    return subscribePersonalReplyConfirmed(({ parent }) => {
      confirmReply(parent);
    });
  }, [confirmReply]);

  if (feedBlocks.length === 0) return null;

  return (
    <div className={className ?? 'home-feed-list'}>
      {feedBlocks.map(
        ({ posts, standingPeek, standingCoilTail }, blockIndex) => (
          <div key={postKey(posts[0]!)}>
            <Divider
              variant="item"
              className={
                blockIndex > 0
                  ? 'post-row-divider'
                  : 'post-row-divider post-row-divider--leading-hidden'
              }
            />
            <FeedThreadBlock
              block={posts}
              standingPeek={standingPeek}
              standingCoilTail={standingCoilTail}
              postAuthorProfiles={postAuthorProfiles}
              quotedPosts={quotedPosts}
              engagement={engagement}
              isReactionPending={isReactionPending}
              isSavePending={isSavePending}
              isSharePending={isSharePending}
              onToggleReaction={toggleReaction}
              onToggleSave={toggleSave}
              onAmplifyConfirmed={(post, detail: PostAmplifySuccessDetail) => {
                const previous = engagement[postKey(post)];
                confirmAmplify(post);
                onAmplified?.(post, {
                  ...detail,
                  isRepeatFromViewer: Boolean(previous?.viewerAmplified),
                });
              }}
              pollTallyFor={pollTallyFor}
              isPollVotePending={isPollVotePending}
              onPollVote={(post, optionIndex) => {
                void castVote(post, optionIndex);
              }}
              onReply={onReply}
              onExpandReply={onExpandReply}
              onQuote={onQuote}
              onRepost={
                onRepost
                  ? (post) => {
                      void withSharePending(post, async () => {
                        const result = await onRepost(post);
                        if (result?.confirmed && result.optimisticPost) {
                          confirmRepost(post, {
                            postId: result.optimisticPost.postId,
                            groupId: result.optimisticPost.groupId,
                          });
                        }
                        return result;
                      });
                    }
                  : undefined
              }
              onUndoRepost={
                onUndoRepost
                  ? (post) => {
                      const viewer = engagement[postKey(post)];
                      const viewerRepostId = viewer?.viewerRepostId;
                      if (!viewerRepostId) return;
                      void withSharePending(post, async () => {
                        const result = await onUndoRepost(post, {
                          postId: viewerRepostId,
                          groupId: viewer.viewerRepostGroupId,
                        });
                        if (result?.confirmed) confirmUnrepost(post);
                        return result;
                      });
                    }
                  : undefined
              }
              showGuildAttribution={showGuildAttribution}
              guildNameById={guildNameById}
            />
          </div>
        )
      )}
    </div>
  );
}

/** Whether an optimistic row should appear in a coalesced feed list. */
export function shouldPrependOptimisticFeedPost(post: PostRow): boolean {
  // Guild writes belong on guild feeds, not the personal home/profile list.
  if (post.groupId || post.isGroupContent) return false;
  // Quotes and roots belong in the feed.
  if (!post.parentPath) return true;
  // Self-replies chain under the parent when it's on-page; others hide.
  const parentAuthor = post.parentAuthor ?? post.parentPath.split('/')[0];
  return parentAuthor === post.accountId;
}

/** Insert an optimistic post without jumping self-threads to the feed head. */
export function insertOptimisticFeedPost(
  posts: readonly PostRow[],
  post: PostRow
): PostRow[] {
  const key = postKey(post);
  if (posts.some((row) => postKey(row) === key)) return [...posts];

  if (post.parentPath) {
    const parentIndex = posts.findIndex(
      (row) => postContentPath(row) === post.parentPath
    );
    if (parentIndex !== -1) {
      const next = posts.slice();
      next.splice(parentIndex, 0, post);
      return next;
    }
  }

  return [post, ...posts];
}
