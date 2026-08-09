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
  amplifyCount: number;
  viewerAmplified: boolean;
}

interface EngagementMap {
  [key: string]: PostEngagement;
}

export const EMPTY_POST_ENGAGEMENT: PostEngagement = {
  replyCount: 0,
  quoteCount: 0,
  reactionCount: 0,
  viewerReacted: false,
  amplifyCount: 0,
  viewerAmplified: false,
};

/**
 * Batched engagement state (reply/quote/reaction/amplify + viewer flags)
 * for a list of visible posts, plus an optimistic reaction toggle.
 * Reaction writes use `wait: true` so the faded pending state lasts until
 * chain confirmation (icon still flips immediately — not pulsing dots).
 * Pass `initial` from SSR so counts paint with the feed (viewer flags
 * soft-upgrade after wallet).
 */
export function usePostEngagement(
  posts: PostRow[],
  opts: {
    initial?: EngagementMap | null;
    onError?: (message: string) => void;
  } = {}
) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [engagement, setEngagement] = useState<EngagementMap>(
    () => opts.initial ?? {}
  );
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const loadIdRef = useRef(0);
  const ssrSkipRef = useRef(Boolean(opts.initial && Object.keys(opts.initial).length > 0));
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

    // SSR already seeded public counts — skip one duplicate until wallet/viewer.
    if (ssrSkipRef.current && !accountId) {
      ssrSkipRef.current = false;
      return;
    }
    ssrSkipRef.current = false;

    const loadId = ++loadIdRef.current;
    const client = createReadOnlyOnSocialClient();
    const paths = targets.map((t) => t.path);

    void Promise.allSettled([
      client.query.threads.countsByPaths(paths),
      client.query.reactions.statesForPosts(
        targets.map((t) => ({ owner: t.owner, postId: t.postId })),
        accountId ? { viewer: accountId } : {}
      ),
      client.query.socialSpend.amplifyCountsForPostPaths(
        paths,
        accountId ? { viewer: accountId } : {}
      ),
    ]).then(([threadResult, reactionResult, amplifyResult]) => {
      if (loadIdRef.current !== loadId) return;
      if (
        threadResult.status === 'rejected' &&
        reactionResult.status === 'rejected' &&
        amplifyResult.status === 'rejected'
      ) {
        return;
      }

      const threadCounts =
        threadResult.status === 'fulfilled' ? threadResult.value : {};
      const reactionStates =
        reactionResult.status === 'fulfilled' ? reactionResult.value : {};
      const amplifyCounts =
        amplifyResult.status === 'fulfilled' ? amplifyResult.value : {};

      const next: EngagementMap = {};
      for (const target of targets) {
        const counts = threadCounts[target.path];
        const reactions = reactionStates[`${target.owner}:${target.postId}`];
        const amplify = amplifyCounts[target.path];
        next[target.key] = {
          replyCount: counts?.replyCount ?? 0,
          quoteCount: counts?.quoteCount ?? 0,
          reactionCount: reactions?.counts.total ?? 0,
          viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
          amplifyCount: amplify?.amplifyCount ?? 0,
          viewerAmplified: amplify?.viewerAmplified ?? false,
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

      const previous = engagement[key] ?? EMPTY_POST_ENGAGEMENT;
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
          { viewer: accountId, wait: true }
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

  const confirmAmplify = useCallback((post: PostRow) => {
    const key = postKey(post);
    setEngagement((current) => {
      const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
      if (previous.viewerAmplified) {
        return {
          ...current,
          [key]: {
            ...previous,
            amplifyCount: previous.amplifyCount + 1,
          },
        };
      }
      return {
        ...current,
        [key]: {
          ...previous,
          viewerAmplified: true,
          amplifyCount: previous.amplifyCount + 1,
        },
      };
    });
  }, []);

  const isReactionPending = useCallback(
    (post: PostRow) => pendingKeys.has(postKey(post)),
    [pendingKeys]
  );

  return {
    engagement,
    toggleReaction,
    isReactionPending,
    confirmAmplify,
  };
}
