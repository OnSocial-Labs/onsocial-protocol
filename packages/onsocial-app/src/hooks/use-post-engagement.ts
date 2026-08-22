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
  repostCount: number;
  reactionCount: number;
  viewerReacted: boolean;
  amplifyCount: number;
  viewerAmplified: boolean;
  /** Private bookmark — never a public count. */
  viewerSaved: boolean;
  viewerReposted: boolean;
  viewerRepostId: string | null;
  viewerRepostGroupId: string | null;
}

export interface EngagementMap {
  [key: string]: PostEngagement;
}

export const EMPTY_POST_ENGAGEMENT: PostEngagement = {
  replyCount: 0,
  quoteCount: 0,
  repostCount: 0,
  reactionCount: 0,
  viewerReacted: false,
  amplifyCount: 0,
  viewerAmplified: false,
  viewerSaved: false,
  viewerReposted: false,
  viewerRepostId: null,
  viewerRepostGroupId: null,
};

/**
 * Merge indexer soft-upgrade into current engagement without clobbering
 * in-flight optimistic reaction/save toggles (or a confirmed amplify/save
 * that the indexer has not caught yet).
 */
export function mergeEngagementSoftUpgrade(
  current: EngagementMap,
  fetched: EngagementMap,
  pendingReactionKeys: ReadonlySet<string>,
  pendingSaveKeys: ReadonlySet<string>,
  unrepostedKeys: ReadonlySet<string> = new Set()
): EngagementMap {
  const merged: EngagementMap = {};
  for (const [key, row] of Object.entries(fetched)) {
    const previous = current[key];
    let next = row;
    if (previous && pendingReactionKeys.has(key)) {
      next = {
        ...next,
        viewerReacted: previous.viewerReacted,
        reactionCount: previous.reactionCount,
      };
    }
    if (previous && pendingSaveKeys.has(key)) {
      next = {
        ...next,
        viewerSaved: previous.viewerSaved,
      };
    }
    if (previous?.viewerSaved && !next.viewerSaved) {
      next = {
        ...next,
        viewerSaved: true,
      };
    }
    if (previous?.viewerAmplified && !next.viewerAmplified) {
      next = {
        ...next,
        viewerAmplified: true,
        amplifyCount: Math.max(next.amplifyCount, previous.amplifyCount),
      };
    }
    if (unrepostedKeys.has(key) && next.viewerReposted) {
      next = {
        ...next,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
        repostCount: Math.min(next.repostCount, previous?.repostCount ?? 0),
      };
    } else if (previous?.viewerReposted && !next.viewerReposted) {
      next = {
        ...next,
        viewerReposted: true,
        viewerRepostId: previous.viewerRepostId,
        viewerRepostGroupId: previous.viewerRepostGroupId,
        repostCount: Math.max(next.repostCount, previous.repostCount),
      };
    }
    merged[key] = next;
  }
  return merged;
}

/**
 * Batched engagement state (reply/quote/reaction/amplify/save + viewer flags)
 * for a list of visible posts, plus optimistic reaction / save toggles.
 * Reaction and save writes use `wait: true` so the faded pending state lasts
 * until chain confirmation (icons still flip immediately — not pulsing dots).
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
  const [pendingReactionKeys, setPendingReactionKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingSaveKeys, setPendingSaveKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [unrepostedKeys, setUnrepostedKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingShareKeys, setPendingShareKeys] = useState<Set<string>>(
    () => new Set()
  );
  const pendingReactionKeysRef = useRef(pendingReactionKeys);
  const pendingSaveKeysRef = useRef(pendingSaveKeys);
  const unrepostedKeysRef = useRef(unrepostedKeys);
  const pendingShareKeysRef = useRef(pendingShareKeys);
  pendingReactionKeysRef.current = pendingReactionKeys;
  pendingSaveKeysRef.current = pendingSaveKeys;
  unrepostedKeysRef.current = unrepostedKeys;
  pendingShareKeysRef.current = pendingShareKeys;
  const loadIdRef = useRef(0);
  const ssrSkipRef = useRef(
    Boolean(opts.initial && Object.keys(opts.initial).length > 0)
  );
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
      accountId
        ? client.query.saves.forPaths(accountId, paths)
        : Promise.resolve([]),
      accountId
        ? client.query.threads.viewerReposts(accountId, paths)
        : Promise.resolve([]),
    ]).then(
      ([
        threadResult,
        reactionResult,
        amplifyResult,
        savesResult,
        viewerRepostResult,
      ]) => {
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
      const savedPaths = new Set(
        savesResult.status === 'fulfilled'
          ? savesResult.value.map((row) => row.contentPath)
          : []
      );
      const viewerReposts = new Map(
        (
          viewerRepostResult.status === 'fulfilled'
            ? viewerRepostResult.value
            : []
        ).map((row) => [row.refPath, row])
      );

      const next: EngagementMap = {};
      for (const target of targets) {
        const counts = threadCounts[target.path];
        const reactions = reactionStates[`${target.owner}:${target.postId}`];
        const amplify = amplifyCounts[target.path];
        const viewerRepost = viewerReposts.get(target.path);
        next[target.key] = {
          replyCount: counts?.replyCount ?? 0,
          quoteCount: counts?.quoteCount ?? 0,
          repostCount: counts?.repostCount ?? 0,
          reactionCount: reactions?.counts.total ?? 0,
          viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
          amplifyCount: amplify?.amplifyCount ?? 0,
          viewerAmplified: amplify?.viewerAmplified ?? false,
          viewerSaved: savedPaths.has(target.path),
          viewerReposted: Boolean(viewerRepost),
          viewerRepostId: viewerRepost?.repostId ?? null,
          viewerRepostGroupId: viewerRepost?.groupId ?? null,
        };
      }
      setEngagement((current) =>
        mergeEngagementSoftUpgrade(
          current,
          next,
          pendingReactionKeysRef.current,
          pendingSaveKeysRef.current,
          unrepostedKeysRef.current
        )
      );
      setUnrepostedKeys((current) => {
        if (current.size === 0) return current;
        const nextKeys = new Set(current);
        for (const target of targets) {
          const viewerRepost = viewerReposts.get(target.path);
          if (nextKeys.has(target.key) && !viewerRepost) {
            nextKeys.delete(target.key);
          }
        }
        return nextKeys;
      });
    }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsSignature]);

  const toggleReaction = useCallback(
    async (post: PostRow) => {
      const key = postKey(post);
      if (pendingReactionKeys.has(key)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const previous = engagement[key] ?? EMPTY_POST_ENGAGEMENT;
      const applied = !previous.viewerReacted;

      setPendingReactionKeys((current) => new Set(current).add(key));
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
        setPendingReactionKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [
      accountId,
      connect,
      engagement,
      getClient,
      isConnected,
      pendingReactionKeys,
    ]
  );

  const toggleSave = useCallback(
    async (post: PostRow) => {
      const key = postKey(post);
      if (pendingSaveKeys.has(key)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const previous = engagement[key] ?? EMPTY_POST_ENGAGEMENT;
      const applied = !previous.viewerSaved;
      const contentPath = postContentPath(post);

      setPendingSaveKeys((current) => new Set(current).add(key));
      setEngagement((current) => ({
        ...current,
        [key]: {
          ...previous,
          viewerSaved: applied,
        },
      }));

      try {
        const { client } = await getClient();
        // Use content path string so guild posts save under the same key
        // engagement membership checks against.
        await client.saves.toggle(contentPath, {
          viewer: accountId,
          wait: true,
        });
      } catch (cause) {
        setEngagement((current) => ({ ...current, [key]: previous }));
        if (!isWalletUserCancellation(cause)) {
          onErrorRef.current?.(
            cause instanceof Error ? cause.message : 'Could not update save.'
          );
        }
      } finally {
        setPendingSaveKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [accountId, connect, engagement, getClient, isConnected, pendingSaveKeys]
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

  const confirmRepost = useCallback(
    (
      post: PostRow,
      viewerRepost: { postId: string; groupId?: string | null }
    ) => {
      const key = postKey(post);
      setUnrepostedKeys((current) => {
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setEngagement((current) => {
        const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
        if (previous.viewerReposted) {
          return {
            ...current,
            [key]: {
              ...previous,
              viewerRepostId: viewerRepost.postId,
              viewerRepostGroupId: viewerRepost.groupId ?? null,
            },
          };
        }
        return {
          ...current,
          [key]: {
            ...previous,
            viewerReposted: true,
            viewerRepostId: viewerRepost.postId,
            viewerRepostGroupId: viewerRepost.groupId ?? null,
            repostCount: previous.repostCount + 1,
          },
        };
      });
    },
    []
  );

  const confirmUnrepost = useCallback((post: PostRow) => {
    const key = postKey(post);
    setUnrepostedKeys((current) => new Set(current).add(key));
    setEngagement((current) => {
      const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
      if (!previous.viewerReposted) return current;
      return {
        ...current,
        [key]: {
          ...previous,
          viewerReposted: false,
          viewerRepostId: null,
          viewerRepostGroupId: null,
          repostCount: Math.max(0, previous.repostCount - 1),
        },
      };
    });
  }, []);

  const isReactionPending = useCallback(
    (post: PostRow) => pendingReactionKeys.has(postKey(post)),
    [pendingReactionKeys]
  );

  const isSavePending = useCallback(
    (post: PostRow) => pendingSaveKeys.has(postKey(post)),
    [pendingSaveKeys]
  );

  const isSharePending = useCallback(
    (post: PostRow) => pendingShareKeys.has(postKey(post)),
    [pendingShareKeys]
  );

  const withSharePending = useCallback(
    async <T,>(post: PostRow, task: () => Promise<T>): Promise<T | undefined> => {
      const key = postKey(post);
      if (pendingShareKeysRef.current.has(key)) return undefined;
      setPendingShareKeys((current) => new Set(current).add(key));
      try {
        return await task();
      } finally {
        setPendingShareKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  return {
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
  };
}
