'use client';

import { useMemo } from 'react';
import { Divider } from '@onsocial/ui';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { FeedThreadBlock } from '@/features/guilds/feed-thread-block';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import { postKey } from '@/features/home/post-card';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
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

interface PersonalFeedListProps {
  posts: PostRow[];
  onReply?: (post: PostRow) => void;
  onQuote?: (post: PostRow) => void;
  /** After amplify tx confirms — parent may optimistic Hot re-rank. */
  onAmplified?: (post: PostRow, detail: AmplifySuccessDetail) => void;
  onEngagementError?: (message: string) => void;
  className?: string;
  /** Hashtag results include replies to other people. */
  includeForeignReplies?: boolean;
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
  onQuote,
  onAmplified,
  onEngagementError,
  className,
  includeForeignReplies = false,
  showGuildAttribution = false,
  initialEngagement = null,
  initialScarceEmbeds = null,
}: PersonalFeedListProps) {
  seedPostAuthorProfilesFromFeed(posts);
  seedGuildDisplayNamesFromFeed(posts);
  seedScarceEmbedsFromSsr(initialScarceEmbeds);

  const feedBlocks = useMemo(
    () => coalesceFeedThreads(posts, { includeForeignReplies }),
    [includeForeignReplies, posts]
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
  const { engagement, toggleReaction, toggleSave, isReactionPending, isSavePending, confirmAmplify } =
    usePostEngagement(posts, {
      initial: initialEngagement,
      onError: onEngagementError,
    });
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(posts, {
    onError: onEngagementError,
  });

  if (feedBlocks.length === 0) return null;

  return (
    <div className={className ?? 'home-feed-list'}>
      {feedBlocks.map((block, blockIndex) => (
        <div key={postKey(block[0]!)}>
          <Divider
            variant="item"
            className={
              blockIndex > 0
                ? 'post-row-divider'
                : 'post-row-divider post-row-divider--leading-hidden'
            }
          />
          <FeedThreadBlock
            block={block}
            postAuthorProfiles={postAuthorProfiles}
            quotedPosts={quotedPosts}
            engagement={engagement}
            isReactionPending={isReactionPending}
            isSavePending={isSavePending}
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
            onQuote={onQuote}
            showGuildAttribution={showGuildAttribution}
            guildNameById={guildNameById}
          />
        </div>
      ))}
    </div>
  );
}

/** Whether an optimistic row should appear in a coalesced feed list. */
export function shouldPrependOptimisticFeedPost(post: PostRow): boolean {
  // Quotes and roots belong in the feed.
  if (!post.parentPath) return true;
  // Self-replies chain under the parent when it's on-page; others hide.
  const parentAuthor = post.parentAuthor ?? post.parentPath.split('/')[0];
  return parentAuthor === post.accountId;
}
