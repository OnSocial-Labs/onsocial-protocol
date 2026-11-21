'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ResolvedFeedPostCard } from '@/features/home/resolved-feed-post-card';
import { PostRowSkeleton } from '@/features/home/post-card';
import type { PostAmplifySuccessDetail } from '@/features/home/post-amplify-form';
import type { WriteDockSubmit } from '@/contexts/compose-launcher-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import {
  hasQuotedPostCacheEntry,
  useQuotedPosts,
} from '@/hooks/use-quoted-posts';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { isBareRepostShell } from '@/lib/feed-repost-card';
import {
  isRepostRefType,
  withRepostOriginals,
} from '@/lib/post-relation';
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

/** Quotes need the inset; bare reposts need the original as the card. */
function peekNeedsRefBody(post: PostRow): boolean {
  const path = post.refPath?.trim();
  if (!path) return false;
  if (isBareRepostShell(post)) return true;
  return !isRepostRefType(post.refType);
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
  /**
   * When false, a confirmed-empty peek keeps the skeleton seat so under-header
   * land does not clamp upward. Parents flip this after land has settled.
   */
  allowEmptyCollapse?: boolean;
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
 * Stable empty-tail seat — title line + one card row so the handoff to
 * “More from” / Discover does not change scrollHeight when content paints.
 */
function ThreadDiscoverPeekSeat() {
  return (
    <div className="thread-discover-peek is-pending" aria-busy="true">
      <div className="thread-discover-peek-title" aria-hidden>
        &nbsp;
      </div>
      <PostRowSkeleton rows={1} />
    </div>
  );
}

/**
 * Empty-thread tail. Parent keeps this mounted; `armed` only gates the fetch.
 * Seat stays until the peek card (and quote inset) can paint — no second
 * skeleton tree, no height drop before content lands.
 */
export function ThreadDiscoverPeek({
  author,
  excludePostId,
  armed = true,
  allowEmptyCollapse = true,
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
  const [refSettled, setRefSettled] = useState(true);

  useEffect(() => {
    // Hold the seat while unarmed — do not clear a painted peek on a brief
    // arm flicker; only reset when a fetch is about to start.
    if (!armed) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- clear prior peek before async fetch so a new author never paints the old card */
    setSettled(false);
    setRefSettled(true);
    setPeek(null);
    /* eslint-enable react-hooks/set-state-in-effect */
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
    if (!peek || !peekNeedsRefBody(peek.post)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ref gate: no body to wait on
      setRefSettled(true);
      return;
    }
    const path = peek.post.refPath!.trim();
    if (quotedPost || hasQuotedPostCacheEntry(path)) {
      setRefSettled(true);
      return;
    }
    setRefSettled(false);
    let cancelled = false;
    let frames = 0;
    const poll = () => {
      if (cancelled) return;
      if (hasQuotedPostCacheEntry(path) || frames > 120) {
        setRefSettled(true);
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
  const postAuthorProfiles = useMemo(() => {
    const out: Record<string, PostAuthorProfile> = { ...fetchedProfiles };
    for (const [id, profile] of Object.entries(authorProfiles ?? {})) {
      if (profile) out[id] = profile;
    }
    return out;
  }, [authorProfiles, fetchedProfiles]);
  const engagementPosts = useMemo(
    () => withRepostOriginals(peekPosts, quotedPosts),
    [peekPosts, quotedPosts]
  );
  const onEngagementError = (message: string) =>
    setTxResult({ type: 'error', msg: message });
  const {
    engagement,
    toggleReaction,
    toggleSave,
    isReactionPending,
    isSavePending,
    isSharePending,
  } = usePostEngagement(engagementPosts, {
    onError: onEngagementError,
  });
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    engagementPosts,
    { onError: onEngagementError }
  );

  // Unarmed / still fetching / quote inset open — one continuous seat.
  if (!armed || !settled || !refSettled || !peek) {
    // Settled empty: collapse only when land can absorb the height drop.
    if (armed && settled && !peek) {
      return allowEmptyCollapse ? null : <ThreadDiscoverPeekSeat />;
    }
    return <ThreadDiscoverPeekSeat />;
  }

  const post = peek.post;
  const profile = postAuthorProfiles[post.accountId];
  const name = displayName(post.accountId, profile?.displayName);
  const hrefForPost = (target: PostRow) => postThreadPath(target);

  return (
    <section className="thread-discover-peek">
      <h2 className="thread-discover-peek-title">
        {peek.own ? `More from ${name}` : 'Discover'}
      </h2>
      <ResolvedFeedPostCard
        post={post}
        quotedPosts={quotedPosts}
        postAuthorProfiles={postAuthorProfiles}
        hrefForPost={hrefForPost}
        preferActionHref
        showRelationBadge={false}
        authorProfiles={postAuthorProfiles}
        {...(menuZIndex != null ? { menuZIndex } : {})}
        engagement={engagement}
        isReactionPending={isReactionPending}
        isSavePending={isSavePending}
        isSharePending={isSharePending}
        onToggleReaction={toggleReaction}
        onToggleSave={toggleSave}
        onReply={onReply}
        onExpandReply={onExpandReply}
        onQuote={onQuote}
        onRepost={onRepost}
        onUndoRepost={onUndoRepost}
        onAmplifyConfirmed={onAmplifyConfirmed}
        pollTallyFor={pollTallyFor}
        isPollVotePending={isPollVotePending}
        onPollVote={(row, optionIndex) => {
          void castVote(row, optionIndex);
        }}
      />
    </section>
  );
}
