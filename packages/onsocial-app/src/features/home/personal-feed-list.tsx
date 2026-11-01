'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Divider } from '@onsocial/ui';
import {
  postContentPath,
  type PostRow,
  type PostScarceEmbed,
} from '@onsocial/sdk';
import { FeedThreadBlock } from '@/features/guilds/feed-thread-block';
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
import { coalesceFeedThreads } from '@/lib/feed-threads';
import {
  withRepostOriginals,
  collectRelationTargetAccountIds,
} from '@/lib/post-relation';
import { useFeedWindow } from '@/features/home/use-feed-window';
import type { FeedWindowSizeCache } from '@/features/home/feed-window';

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
  /** Shared row-height cache for windowing (session persistence in home). */
  windowSizeCache?: FeedWindowSizeCache;
  /** Row that must stay mounted this pass (re-rank scroll anchor). */
  pinnedFeedKey?: string | null;
}

/** Shared home/profile feed rendering — thread blocks + quote insets + polls. */
export function PersonalFeedList({
  posts,
  onReply,
  onExpandReply,
  onQuote,
  onRepost,
  onUndoRepost,
  onEngagementError,
  className,
  includeForeignReplies = false,
  stoodWithAccountIds,
  showGuildAttribution = false,
  initialEngagement = null,
  initialScarceEmbeds = null,
  windowSizeCache,
  pinnedFeedKey = null,
}: PersonalFeedListProps) {
  const feedBlocks = useMemo(
    () =>
      coalesceFeedThreads(posts, {
        includeForeignReplies,
        stoodWithAccountIds,
      }),
    [includeForeignReplies, posts, stoodWithAccountIds]
  );
  const quotedPosts = useQuotedPosts(posts);

  /*
   * Hydration parity: SSR paints bylines and guild chips from a warm
   * server-side cache, so the first client render must seed synchronously
   * too. Every later reseed (appended pages, resolved quotes, fresh SSR
   * embeds) goes through the layout effects below with notify — module
   * caches are no longer written on every render.
   */
  useState(() => {
    seedPostAuthorProfilesFromFeed(posts);
    seedGuildDisplayNamesFromFeed(posts);
    seedScarceEmbedsFromSsr(initialScarceEmbeds);
    const quoted = Object.values(quotedPosts);
    seedPostAuthorProfilesFromFeed(quoted);
    seedGuildDisplayNamesFromFeed(quoted);
    return null;
  });

  useLayoutEffect(() => {
    seedPostAuthorProfilesFromFeed(posts, { notify: true });
    seedGuildDisplayNamesFromFeed(posts, { notify: true });
    seedScarceEmbedsFromSsr(initialScarceEmbeds, { notify: true });
  }, [posts, initialScarceEmbeds]);

  useLayoutEffect(() => {
    const quoted = Object.values(quotedPosts);
    seedPostAuthorProfilesFromFeed(quoted, { notify: true });
    seedGuildDisplayNamesFromFeed(quoted, { notify: true });
  }, [quotedPosts]);

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

  /*
   * Stable per-card callbacks — the engagement map changes identity on every
   * toggle, so closures over it would re-render every memoized card.
   */
  const engagementRef = useRef(engagement);
  useLayoutEffect(() => {
    engagementRef.current = engagement;
  }, [engagement]);

  const handleAmplifyConfirmed = useCallback(
    (post: PostRow) => {
      confirmAmplify(post);
    },
    [confirmAmplify]
  );

  const handlePollVote = useCallback(
    (post: PostRow, optionIndex: number) => {
      void castVote(post, optionIndex);
    },
    [castVote]
  );

  const handleRepost = useCallback(
    (post: PostRow) => {
      if (!onRepost) return;
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
    },
    [confirmRepost, onRepost, withSharePending]
  );

  const handleUndoRepost = useCallback(
    (post: PostRow) => {
      if (!onUndoRepost) return;
      const viewer = engagementRef.current[postKey(post)];
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
    },
    [confirmUnrepost, onUndoRepost, withSharePending]
  );

  const blockKeys = useMemo(
    () => feedBlocks.map((block) => postKey(block.posts[0]!)),
    [feedBlocks]
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const feedWindow = useFeedWindow({
    keys: blockKeys,
    hostRef,
    sizeCache: windowSizeCache,
    pinnedKey: pinnedFeedKey,
  });

  if (feedBlocks.length === 0) return null;

  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    feedWindow;

  return (
    <div ref={hostRef} className={className ?? 'home-feed-list'}>
      {windowed && topSpacer > 0 ? (
        <div
          style={{ height: topSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="top"
        />
      ) : null}
      {feedBlocks
        .slice(start, end)
        .map(({ posts, standingPeek, standingCoilTail }, sliceIndex) => {
          const blockIndex = start + sliceIndex;
          const key = blockKeys[blockIndex]!;
          return (
            <div
              key={key}
              ref={registerRow(key)}
              className={
                windowed
                  ? 'home-feed-block home-feed-block--windowed'
                  : 'home-feed-block'
              }
              data-feed-key={key}
            >
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
                onAmplifyConfirmed={handleAmplifyConfirmed}
                pollTallyFor={pollTallyFor}
                isPollVotePending={isPollVotePending}
                onPollVote={handlePollVote}
                onReply={onReply}
                onExpandReply={onExpandReply}
                onQuote={onQuote}
                onRepost={onRepost ? handleRepost : undefined}
                onUndoRepost={onUndoRepost ? handleUndoRepost : undefined}
                showGuildAttribution={showGuildAttribution}
                guildNameById={guildNameById}
              />
            </div>
          );
        })}
      {windowed && bottomSpacer > 0 ? (
        <div
          style={{ height: bottomSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="bottom"
        />
      ) : null}
    </div>
  );
}

/** Whether an optimistic row should appear in a coalesced feed list. */
export function shouldPrependOptimisticFeedPost(post: PostRow): boolean {
  // New guild roots belong on guild feeds. Replies still land on Pulse —
  // self-thread or a bridge onto a stranger parent.
  if ((post.groupId || post.isGroupContent) && !post.parentPath) return false;
  return true;
}

function isListedParent(row: PostRow, post: PostRow): boolean {
  if (!post.parentPath) return false;
  if (postContentPath(row) === post.parentPath) return true;
  const parentAuthor = post.parentAuthor ?? post.parentPath.split('/')[0];
  const parentPostId = post.parentPath.split('/').pop();
  return row.accountId === parentAuthor && row.postId === parentPostId;
}

function listedParentForReply(
  posts: readonly PostRow[],
  post: PostRow,
  snapshot?: PostRow | null
): PostRow | undefined {
  if (!post.parentPath) return undefined;
  if (snapshot && isListedParent(snapshot, post)) return snapshot;
  return posts.find((row) => isListedParent(row, post));
}

/**
 * Insert an optimistic post at the feed head. A reply brings its parent
 * with it so Pulse shows the original card + reply, not the reply alone.
 * Safe to call twice — a reply-only insert still gets the parent on retry.
 */
export function insertOptimisticFeedPost(
  posts: readonly PostRow[],
  post: PostRow,
  parent?: PostRow | null
): PostRow[] {
  const key = postKey(post);
  const snapshot = listedParentForReply(posts, post, parent);
  const withoutReply = posts.filter((row) => postKey(row) !== key);

  if (!snapshot) {
    if (withoutReply.length !== posts.length) return [...posts];
    return [post, ...posts];
  }

  const reply = {
    ...post,
    parentPath: postContentPath(snapshot),
    parentAuthor: snapshot.accountId,
  };
  const rest = withoutReply.filter((row) => postKey(row) !== postKey(snapshot));
  return [reply, snapshot, ...rest];
}
