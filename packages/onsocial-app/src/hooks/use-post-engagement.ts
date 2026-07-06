'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { postKey } from '@/lib/post-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const DEFAULT_REACTION_KIND = 'like';

export interface PostEngagement {
  replyCount: number;
  quoteCount: number;
  reactionCount: number;
  viewerReacted: boolean;
}

interface EngagementMap {
  [key: string]: PostEngagement;
}

/**
 * Batched engagement state (reply/quote/reaction counts + viewer reaction)
 * for a list of visible posts, plus an optimistic reaction toggle.
 * Reads stay canonical: two GraphQL round-trips per visible page.
 */
export function usePostEngagement(
  posts: PostRow[],
  opts: { onError?: (message: string) => void } = {}
) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [engagement, setEngagement] = useState<EngagementMap>({});
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const loadIdRef = useRef(0);
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  const targets = useMemo(
    () =>
      posts.map((post) => ({
        key: postKey(post),
        path: postContentPath(post),
        owner: post.accountId,
        postId: post.postId,
      })),
    [posts]
  );
  const targetsSignature = useMemo(
    () => targets.map((t) => t.path).join('\n') + `\n@${accountId ?? ''}`,
    [targets, accountId]
  );

  useEffect(() => {
    if (targets.length === 0) return;

    const loadId = ++loadIdRef.current;
    const client = createReadOnlyOnSocialClient();

    void Promise.allSettled([
      client.query.threads.countsByPaths(targets.map((t) => t.path)),
      client.query.reactions.statesForPosts(
        targets.map((t) => ({ owner: t.owner, postId: t.postId })),
        accountId ? { viewer: accountId } : {}
      ),
    ]).then(([threadResult, reactionResult]) => {
      if (loadIdRef.current !== loadId) return;
      if (
        threadResult.status === 'rejected' &&
        reactionResult.status === 'rejected'
      ) {
        // Engagement is an enhancement layer; rows still render without it.
        return;
      }

      const threadCounts =
        threadResult.status === 'fulfilled' ? threadResult.value : {};
      const reactionStates =
        reactionResult.status === 'fulfilled' ? reactionResult.value : {};

      const next: EngagementMap = {};
      for (const target of targets) {
        const counts = threadCounts[target.path];
        const reactions = reactionStates[`${target.owner}:${target.postId}`];
        next[target.key] = {
          replyCount: counts?.replyCount ?? 0,
          quoteCount: counts?.quoteCount ?? 0,
          reactionCount: reactions?.counts.total ?? 0,
          viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
        };
      }
      setEngagement(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsSignature]);

  const toggleReaction = useCallback(
    async (post: PostRow) => {
      const key = postKey(post);
      if (pendingKeys.has(key)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const previous = engagement[key] ?? {
        replyCount: 0,
        quoteCount: 0,
        reactionCount: 0,
        viewerReacted: false,
      };
      const applied = !previous.viewerReacted;

      setPendingKeys((current) => new Set(current).add(key));
      setEngagement((current) => ({
        ...current,
        [key]: {
          ...previous,
          viewerReacted: applied,
          reactionCount: Math.max(
            0,
            previous.reactionCount + (applied ? 1 : -1)
          ),
        },
      }));

      try {
        const { client } = await getClient();
        await client.reactions.toggle(
          { author: post.accountId, postId: post.postId },
          DEFAULT_REACTION_KIND,
          { viewer: accountId }
        );
      } catch (cause) {
        setEngagement((current) => ({ ...current, [key]: previous }));
        if (!isWalletUserCancellation(cause)) {
          onErrorRef.current?.(
            cause instanceof Error
              ? cause.message
              : 'Could not update reaction.'
          );
        }
      } finally {
        setPendingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [accountId, connect, engagement, getClient, isConnected, pendingKeys]
  );

  const isReactionPending = useCallback(
    (post: PostRow) => pendingKeys.has(postKey(post)),
    [pendingKeys]
  );

  return { engagement, toggleReaction, isReactionPending };
}
