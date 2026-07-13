'use client';

import { useMemo } from 'react';
import { Divider } from '@onsocial/ui';
import type { PostRow } from '@onsocial/sdk';
import { FeedThreadBlock } from '@/features/guilds/feed-thread-block';
import { postKey } from '@/features/home/post-card';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useQuotedPosts } from '@/hooks/use-quoted-posts';
import { coalesceFeedThreads } from '@/lib/feed-threads';

interface PersonalFeedListProps {
  posts: PostRow[];
  onReply?: (post: PostRow) => void;
  onQuote?: (post: PostRow) => void;
  onEngagementError?: (message: string) => void;
  className?: string;
}

/** Shared home/profile feed rendering — thread blocks + quote insets + polls. */
export function PersonalFeedList({
  posts,
  onReply,
  onQuote,
  onEngagementError,
  className,
}: PersonalFeedListProps) {
  const feedBlocks = useMemo(() => coalesceFeedThreads(posts), [posts]);
  const quotedPosts = useQuotedPosts(posts);

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const post of posts) ids.add(post.accountId);
    for (const quoted of Object.values(quotedPosts)) {
      ids.add(quoted.accountId);
    }
    return Array.from(ids);
  }, [posts, quotedPosts]);

  const postAuthorProfiles = usePostAuthorProfiles(authorIds);
  const { engagement, toggleReaction, isReactionPending } = usePostEngagement(
    posts,
    { onError: onEngagementError }
  );
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(posts, {
    onError: onEngagementError,
  });

  if (feedBlocks.length === 0) return null;

  return (
    <div className={className ?? 'home-feed-list'}>
      {feedBlocks.map((block, blockIndex) => (
        <div key={postKey(block[0]!)}>
          {blockIndex > 0 ? (
            <Divider variant="item" className="post-row-divider" />
          ) : null}
          <FeedThreadBlock
            block={block}
            postAuthorProfiles={postAuthorProfiles}
            quotedPosts={quotedPosts}
            engagement={engagement}
            isReactionPending={isReactionPending}
            onToggleReaction={toggleReaction}
            pollTallyFor={pollTallyFor}
            isPollVotePending={isPollVotePending}
            onPollVote={(post, optionIndex) => {
              void castVote(post, optionIndex);
            }}
            onReply={onReply}
            onQuote={onQuote}
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
