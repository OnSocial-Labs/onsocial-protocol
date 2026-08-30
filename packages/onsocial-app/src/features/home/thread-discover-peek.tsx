'use client';

import { useEffect, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { PostCard, postKey } from '@/features/home/post-card';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { postThreadPath } from '@/lib/post-routes';

const PEEK_FETCH_LIMIT = 8;

interface ThreadDiscoverPeekProps {
  /** Thread root author — "More from {author}" is tried first. */
  author: string;
  /** The post being viewed — never peek itself. */
  excludePostId: string;
  /** Profiles already loaded by the thread (avoids a duplicate author fetch). */
  authorProfiles?: Record<string, PostAuthorProfile | undefined>;
}

/**
 * Empty-thread tail: one quiet post instead of "No replies yet." chrome.
 * Author's latest root first; falls back to a global recent post. Renders
 * nothing until a peek resolves — no skeleton, no layout shift.
 */
export function ThreadDiscoverPeek({
  author,
  excludePostId,
  authorProfiles,
}: ThreadDiscoverPeekProps) {
  const { setTxResult } = useAppTransactionFeedback();
  const [peek, setPeek] = useState<{ post: PostRow; own: boolean } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    (async () => {
      const ownPage = await client.query.feed
        .recent({ author, section: 'posts', limit: PEEK_FETCH_LIMIT })
        .catch(() => null);
      const own = ownPage?.items.find((row) => row.postId !== excludePostId);
      if (own) {
        if (!cancelled) setPeek({ post: own, own: true });
        return;
      }
      const globalPage = await client.query.feed
        .recent({ limit: PEEK_FETCH_LIMIT })
        .catch(() => null);
      const other = globalPage?.items.find(
        (row) => !(row.accountId === author && row.postId === excludePostId)
      );
      if (other && !cancelled) setPeek({ post: other, own: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [author, excludePostId]);

  const profileIds = peek ? [peek.post.accountId] : [];
  const fetchedProfiles = usePostAuthorProfiles(profileIds);
  const {
    engagement,
    toggleReaction,
    toggleSave,
    isReactionPending,
    isSavePending,
  } = usePostEngagement(peek ? [peek.post] : [], {
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });

  if (!peek) return null;

  const post = peek.post;
  const profile =
    authorProfiles?.[post.accountId] ?? fetchedProfiles[post.accountId];
  const name = profile?.displayName?.trim() || `@${post.accountId}`;

  return (
    <section className="thread-discover-peek">
      <Divider variant="detail" />
      <h2 className="thread-discover-peek-title">
        {peek.own ? `More from ${name}` : 'Discover'}
      </h2>
      <PostCard
        post={post}
        authorProfile={profile}
        actionHref={postThreadPath(post)}
        showRelationBadge={false}
        engagement={engagement[postKey(post)] ?? EMPTY_POST_ENGAGEMENT}
        reactionPending={isReactionPending(post)}
        savePending={isSavePending(post)}
        onToggleReaction={toggleReaction}
        onToggleSave={toggleSave}
      />
    </section>
  );
}
