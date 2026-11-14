'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { PostCard, postKey } from '@/features/home/post-card';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import type { WriteDockSubmit } from '@/contexts/compose-launcher-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import {
  hasQuotedPostCacheEntry,
  useQuotedPosts,
} from '@/hooks/use-quoted-posts';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { isRepostRefType } from '@/lib/post-relation';
import { displayName } from '@/lib/profile-display';
import { postThreadPath } from '@/lib/post-routes';

const PEEK_FETCH_LIMIT = 8;

function postIdsEqual(left: string, right: string): boolean {
  try {
    return decodeURIComponent(left) === decodeURIComponent(right);
  } catch {
    return left === right;
  }
}

function peekNeedsQuotedBody(post: PostRow): boolean {
  const path = post.refPath?.trim();
  return Boolean(path) && !isRepostRefType(post.refType);
}

interface ThreadDiscoverPeekProps {
  /** Thread root author — "More from {author}" is tried first. */
  author: string;
  /** The post being viewed — never peek itself. */
  excludePostId: string;
  /**
   * False while replies are still resolving — do not fetch yet. Parent
   * mounts this once so the peek never remounts across reply soft-fill.
   */
  armed?: boolean;
  /** Profiles already loaded by the thread (avoids a duplicate author fetch). */
  authorProfiles?: Record<string, PostAuthorProfile | undefined>;
  /** Keep ⋮ and share drawers above the open post sheet. */
  menuZIndex?: number;
  onReply?: (post: PostRow) => void;
  onExpandReply?: (post: PostRow, draft: WriteDockSubmit) => void;
  onQuote?: (post: PostRow) => void;
  onRepost?: (post: PostRow) => void;
  onUndoRepost?: (post: PostRow) => void;
  onAmplifyConfirmed?: (post: PostRow, detail: PostAmplifySuccessDetail) => void;
}

/**
 * Empty-thread tail. Null until ready + quote settled (no seat). Soft-fills
 * below the hero appear with the shared opacity motion.
 */
export function ThreadDiscoverPeek({
  author,
  excludePostId,
  armed = true,
  authorProfiles,
  menuZIndex,
  onReply,
  onExpandReply,
  onQuote,
  onRepost,
  onUndoRepost,
  onAmplifyConfirmed,
}: ThreadDiscoverPeekProps) {
  const { setTxResult } = useAppTransactionFeedback();
  const [peek, setPeek] = useState<{ post: PostRow; own: boolean } | null>(
    null
  );
  const [settled, setSettled] = useState(false);
  const [quoteSettled, setQuoteSettled] = useState(true);

  useEffect(() => {
    if (!armed) {
      setSettled(false);
      setQuoteSettled(true);
      setPeek(null);
      return;
    }
    let cancelled = false;
    setSettled(false);
    setQuoteSettled(true);
    setPeek(null);
    const client = createReadOnlyOnSocialClient();
    (async () => {
      const ownPage = await client.query.feed
        .recent({ author, section: 'posts', limit: PEEK_FETCH_LIMIT })
        .catch(() => null);
      const own = ownPage?.items.find(
        (row) => !postIdsEqual(row.postId, excludePostId)
      );
      if (own) {
        if (!cancelled) {
          setPeek({ post: own, own: true });
          setSettled(true);
        }
        return;
      }
      const globalPage = await client.query.feed
        .recent({ limit: PEEK_FETCH_LIMIT })
        .catch(() => null);
      const other = globalPage?.items.find(
        (row) =>
          !(
            row.accountId === author &&
            postIdsEqual(row.postId, excludePostId)
          )
      );
      if (!cancelled) {
        if (other) setPeek({ post: other, own: false });
        setSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [armed, author, excludePostId]);

  const peekPosts = useMemo(() => (peek ? [peek.post] : []), [peek]);
  const quotedPosts = useQuotedPosts(peekPosts);
  const quotedPost = peek?.post.refPath
    ? quotedPosts[peek.post.refPath]
    : undefined;

  useEffect(() => {
    if (!peek) {
      setQuoteSettled(true);
      return;
    }
    if (!peekNeedsQuotedBody(peek.post)) {
      setQuoteSettled(true);
      return;
    }
    const path = peek.post.refPath!.trim();
    if (quotedPost || hasQuotedPostCacheEntry(path)) {
      setQuoteSettled(true);
      return;
    }
    setQuoteSettled(false);
    let cancelled = false;
    let frames = 0;
    const poll = () => {
      if (cancelled) return;
      if (hasQuotedPostCacheEntry(path) || frames > 120) {
        setQuoteSettled(true);
        return;
      }
      frames += 1;
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    return () => {
      cancelled = true;
    };
  }, [peek, quotedPost]);

  const profileIds = useMemo(() => {
    const ids: string[] = [];
    if (peek) ids.push(peek.post.accountId);
    if (quotedPost) ids.push(quotedPost.accountId);
    return ids;
  }, [peek, quotedPost]);
  const fetchedProfiles = usePostAuthorProfiles(profileIds);
  const onEngagementError = (message: string) =>
    setTxResult({ type: 'error', msg: message });
  const {
    engagement,
    toggleReaction,
    toggleSave,
    isReactionPending,
    isSavePending,
    isSharePending,
  } = usePostEngagement(peekPosts, {
    onError: onEngagementError,
  });
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    peekPosts,
    { onError: onEngagementError }
  );

  if (!armed || !settled || !quoteSettled || !peek) return null;

  const post = peek.post;
  const profile =
    authorProfiles?.[post.accountId] ?? fetchedProfiles[post.accountId];
  const quotedAuthorProfile = quotedPost
    ? (authorProfiles?.[quotedPost.accountId] ??
      fetchedProfiles[quotedPost.accountId])
    : undefined;
  const name = displayName(post.accountId, profile?.displayName);

  return (
    <section className="thread-discover-peek">
      <h2 className="thread-discover-peek-title">
        {peek.own ? `More from ${name}` : 'Discover'}
      </h2>
      <PostCard
        post={post}
        authorProfile={profile}
        actionHref={postThreadPath(post)}
        preferActionHref
        showRelationBadge={false}
        quotedPost={quotedPost}
        quotedAuthorProfile={quotedAuthorProfile}
        quotedHref={quotedPost ? postThreadPath(quotedPost) : undefined}
        {...(menuZIndex != null ? { menuZIndex } : {})}
        engagement={engagement[postKey(post)] ?? EMPTY_POST_ENGAGEMENT}
        reactionPending={isReactionPending(post)}
        savePending={isSavePending(post)}
        sharePending={isSharePending(post)}
        onToggleReaction={toggleReaction}
        onToggleSave={toggleSave}
        onReply={onReply}
        onExpandReply={onExpandReply}
        onQuote={onQuote}
        onRepost={onRepost}
        onUndoRepost={onUndoRepost}
        onAmplifyConfirmed={onAmplifyConfirmed}
        pollTally={pollTallyFor(post)}
        pollVotePending={isPollVotePending(post)}
        onPollVote={(row, optionIndex) => {
          void castVote(row, optionIndex);
        }}
      />
    </section>
  );
}
