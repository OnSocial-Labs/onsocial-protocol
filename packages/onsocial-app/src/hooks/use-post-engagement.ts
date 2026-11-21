'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { pollIndexConfirm } from '@/lib/index-confirm-poll';
import {
  subscribePersonalQuoteConfirmed,
  subscribePersonalReplyConfirmed,
} from '@/features/scarces/drop-compose-host';
import { recordViewerAmplifyConfirmed } from '@/lib/home-feed-amplify-epoch';
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
  /** Bumps only when the viewer's own like confirms, so other cards stay still. */
  reactionRoll: number;
  /** Bumps only when the viewer's own amplify confirms. */
  amplifyRoll: number;
  /** Bumps only when the viewer's own reply confirms. */
  replyRoll: number;
  /** Bumps when the viewer's repost, undo, or quote confirms. */
  shareRoll: number;
}

export interface EngagementMap {
  [key: string]: PostEngagement;
}

/**
 * Heart moves immediately. The count stays until the like is final and the
 * indexer agrees, or that short wait ends, so a cancel never flashes a number.
 */
export function pendingReactionEngagement(
  previous: PostEngagement,
  applied: boolean
): PostEngagement {
  return {
    ...previous,
    viewerReacted: applied,
  };
}

/** Local like total. The indexer match and the timeout fallback both use this. */
export function reactionCountAfterToggle(
  count: number,
  applied: boolean
): number {
  return Math.max(0, count + (applied ? 1 : -1));
}

/** Count moves once the like is settled and the heart can stop pulsing. */
export function confirmedReactionEngagement(
  previous: PostEngagement,
  applied: boolean
): PostEngagement {
  return {
    ...previous,
    viewerReacted: applied,
    reactionCount: reactionCountAfterToggle(previous.reactionCount, applied),
    reactionRoll: previous.reactionRoll + 1,
  };
}

/** All fields are primitives — identity-preserving merges compare by value. */
function samePostEngagement(a: PostEngagement, b: PostEngagement): boolean {
  return (
    a.replyCount === b.replyCount &&
    a.quoteCount === b.quoteCount &&
    a.repostCount === b.repostCount &&
    a.reactionCount === b.reactionCount &&
    a.viewerReacted === b.viewerReacted &&
    a.amplifyCount === b.amplifyCount &&
    a.viewerAmplified === b.viewerAmplified &&
    a.viewerSaved === b.viewerSaved &&
    a.viewerReposted === b.viewerReposted &&
    a.viewerRepostId === b.viewerRepostId &&
    a.viewerRepostGroupId === b.viewerRepostGroupId &&
    a.reactionRoll === b.reactionRoll &&
    a.amplifyRoll === b.amplifyRoll &&
    a.replyRoll === b.replyRoll &&
    a.shareRoll === b.shareRoll
  );
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
  reactionRoll: 0,
  amplifyRoll: 0,
  replyRoll: 0,
  shareRoll: 0,
};

/**
 * Drop rows that left the live post list. Feed windowing only fetches the
 * near band — without this prune the map grows for every row ever painted.
 */
export function pruneEngagementMap(
  current: EngagementMap,
  liveKeys: ReadonlySet<string>
): EngagementMap {
  let changed = false;
  const next: EngagementMap = {};
  for (const [key, row] of Object.entries(current)) {
    if (liveKeys.has(key)) next[key] = row;
    else changed = true;
  }
  return changed ? next : current;
}

/**
 * Viewer-owned flags that must survive feed window prune. Public counts stay
 * on the seed; these paint active icon colour on scroll-back without waiting
 * for the async overlay.
 */
export type ViewerEngagementMemory = {
  viewerReacted: boolean;
  viewerAmplified: boolean;
  viewerSaved: boolean;
  viewerReposted: boolean;
  viewerRepostId: string | null;
  viewerRepostGroupId: string | null;
};

export function viewerEngagementMemoryFrom(
  row: PostEngagement
): ViewerEngagementMemory {
  return {
    viewerReacted: row.viewerReacted,
    viewerAmplified: row.viewerAmplified,
    viewerSaved: row.viewerSaved,
    viewerReposted: row.viewerReposted,
    viewerRepostId: row.viewerRepostId,
    viewerRepostGroupId: row.viewerRepostGroupId,
  };
}

export function rememberViewerEngagement(
  store: Map<string, ViewerEngagementMemory>,
  key: string,
  row: PostEngagement
): void {
  store.set(key, viewerEngagementMemoryFrom(row));
}

/** Merge last-good viewer flags onto a count-only seed row. */
export function withViewerEngagementMemory(
  row: PostEngagement,
  memory: ViewerEngagementMemory | undefined
): PostEngagement {
  if (!memory) return row;
  const next: PostEngagement = {
    ...row,
    viewerReacted: memory.viewerReacted,
    viewerAmplified: memory.viewerAmplified,
    viewerSaved: memory.viewerSaved,
    viewerReposted: memory.viewerReposted,
    viewerRepostId: memory.viewerRepostId,
    viewerRepostGroupId: memory.viewerRepostGroupId,
  };
  return samePostEngagement(next, row) ? row : next;
}

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
    if (previous && next.replyCount < previous.replyCount) {
      next = {
        ...next,
        replyCount: previous.replyCount,
      };
    }
    if (previous && next.quoteCount < previous.quoteCount) {
      next = {
        ...next,
        quoteCount: previous.quoteCount,
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
    if (!previous) {
      merged[key] = next;
      continue;
    }
    const candidate: PostEngagement = {
      ...next,
      reactionRoll: previous.reactionRoll,
      amplifyRoll: previous.amplifyRoll,
      replyRoll: previous.replyRoll,
      shareRoll: previous.shareRoll,
    };
    /*
     * Keep the previous object when nothing actually changed — memoized
     * cards key off this identity, and an indexer refetch must not
     * re-render every card whose counts came back identical.
     */
    merged[key] = samePostEngagement(candidate, previous)
      ? previous
      : candidate;
  }
  return merged;
}

/**
 * Batched engagement state (reply/quote/reaction/amplify/save + viewer flags)
 * for a list of visible posts, plus optimistic reaction / save toggles.
 * Reaction and save writes use `wait: true` so the faded pending state lasts
 * until chain confirmation (icons still flip immediately — not pulsing dots).
 * Pass `initial` from the page paint so counts are final. A signed-in
 * viewer then overlays like, save, and repost flags without recounting —
 * and last-good memory keeps those flags across window prune.
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
  const engagementRef = useRef(engagement);
  pendingReactionKeysRef.current = pendingReactionKeys;
  pendingSaveKeysRef.current = pendingSaveKeys;
  unrepostedKeysRef.current = unrepostedKeys;
  pendingShareKeysRef.current = pendingShareKeys;
  engagementRef.current = engagement;
  const loadIdRef = useRef(0);
  const initialRef = useRef<EngagementMap | null>(opts.initial ?? null);
  const viewerOverlayRef = useRef<{
    accountId: string;
    keys: Set<string>;
  } | null>(null);
  /** Survives prune so scroll-back paints active colour with the seed counts. */
  const viewerMemoryRef = useRef<Map<string, ViewerEngagementMemory>>(
    new Map()
  );
  const viewerMemoryAccountRef = useRef<string | null>(accountId ?? null);
  if (viewerMemoryAccountRef.current !== (accountId ?? null)) {
    viewerMemoryAccountRef.current = accountId ?? null;
    viewerMemoryRef.current.clear();
    viewerOverlayRef.current = null;
  }
  const incomingInitial = opts.initial ?? null;
  if (incomingInitial !== initialRef.current) {
    initialRef.current = incomingInitial;
    if (
      incomingInitial &&
      Object.keys(incomingInitial).some(
        (key) => !(key in engagementRef.current)
      )
    ) {
      const memory = viewerMemoryRef.current;
      setEngagement((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [key, row] of Object.entries(incomingInitial)) {
          if (key in next) continue;
          next[key] = withViewerEngagementMemory(row, memory.get(key));
          changed = true;
        }
        return changed ? next : prev;
      });
    }
  }
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

  // Bound the map to the live band — remember viewer flags before prune.
  useEffect(() => {
    const live = new Set(targets.map((target) => target.key));
    const memory = viewerMemoryRef.current;
    setEngagement((current) => {
      for (const [key, row] of Object.entries(current)) {
        if (!live.has(key)) rememberViewerEngagement(memory, key, row);
      }
      return pruneEngagementMap(current, live);
    });
    const overlay = viewerOverlayRef.current;
    if (!overlay) return;
    for (const key of [...overlay.keys]) {
      if (!live.has(key)) overlay.keys.delete(key);
    }
  }, [targetsSignature, targets]);

  useEffect(() => {
    if (targets.length === 0) {
      return;
    }

    const known = engagementRef.current;
    const missing = targets.filter((target) => !(target.key in known));
    const memory = viewerMemoryRef.current;
    const overlayFor =
      accountId == null
        ? []
        : (() => {
            const done = viewerOverlayRef.current;
            if (!done || done.accountId !== accountId) return targets;
            return targets.filter((target) => !done.keys.has(target.key));
          })();

    const rememberOverlay = (rows: typeof targets) => {
      if (!accountId || rows.length === 0) return;
      const done = viewerOverlayRef.current;
      const keys =
        done && done.accountId === accountId ? done.keys : new Set<string>();
      for (const row of rows) keys.add(row.key);
      viewerOverlayRef.current = { accountId, keys };
    };

    // Counts already on the row stay. A signed-in viewer only picks up
    // their own like, save, and repost — a recount would roll the numbers.
    if (missing.length === 0) {
      if (overlayFor.length === 0 || !accountId) return;
      const viewerId = accountId;
      const loadId = ++loadIdRef.current;
      const client = createReadOnlyOnSocialClient();
      const paths = overlayFor.map((target) => target.path);
      const overlayRows = overlayFor;
      void Promise.allSettled([
        client.query.reactions.statesForPosts(
          overlayRows.map((target) => ({
            owner: target.owner,
            postId: target.postId,
          })),
          { viewer: viewerId }
        ),
        client.query.saves.forPaths(viewerId, paths),
        client.query.threads.viewerReposts(viewerId, paths),
        client.query.socialSpend.amplifyCountsForPostPaths(paths, {
          viewer: viewerId,
        }),
      ]).then(
        ([reactionResult, savesResult, viewerRepostResult, amplifyResult]) => {
          if (loadIdRef.current !== loadId) return;
          const reactionStates =
            reactionResult.status === 'fulfilled' ? reactionResult.value : {};
          const savedPaths = new Set(
            savesResult.status === 'fulfilled'
              ? savesResult.value.map((row) => row.contentPath)
              : []
          );
          const viewerReposts = new Map(
            (viewerRepostResult.status === 'fulfilled'
              ? viewerRepostResult.value
              : []
            ).map((row) => [row.refPath, row])
          );
          const amplifyCounts =
            amplifyResult.status === 'fulfilled' ? amplifyResult.value : {};
          rememberOverlay(overlayRows);
          setEngagement((current) => {
            const next: EngagementMap = { ...current };
            for (const target of overlayRows) {
              const previous = current[target.key];
              if (!previous) continue;
              const reactions =
                reactionStates[`${target.owner}:${target.postId}`];
              const viewerRepost = viewerReposts.get(target.path);
              const amplify = amplifyCounts[target.path];
              const row: PostEngagement = {
                ...previous,
                viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
                viewerSaved:
                  savedPaths.has(target.path) || previous.viewerSaved,
                viewerAmplified:
                  amplify?.viewerAmplified || previous.viewerAmplified,
                viewerReposted:
                  Boolean(viewerRepost) || previous.viewerReposted,
                viewerRepostId:
                  viewerRepost?.repostId ?? previous.viewerRepostId,
                viewerRepostGroupId:
                  viewerRepost?.groupId ?? previous.viewerRepostGroupId,
              };
              next[target.key] = row;
              rememberViewerEngagement(memory, target.key, row);
            }
            return next;
          });
        }
      );
      return;
    }

    /*
     * Scroll-back: paint seed counts + last-good viewer flags in this frame
     * so active colour is not waiting on the network.
     */
    const seed = initialRef.current;
    if (seed || memory.size > 0) {
      setEngagement((current) => {
        let changed = false;
        const next = { ...current };
        for (const target of missing) {
          if (target.key in next) continue;
          const base = seed?.[target.key];
          const remembered = memory.get(target.key);
          if (!base && !remembered) continue;
          next[target.key] = withViewerEngagementMemory(
            base ?? EMPTY_POST_ENGAGEMENT,
            remembered
          );
          changed = true;
        }
        return changed ? next : current;
      });
    }

    const loadId = ++loadIdRef.current;
    const client = createReadOnlyOnSocialClient();
    const pending = missing;
    const paths = pending.map((target) => target.path);

    void Promise.allSettled([
      client.query.threads.countsByPaths(paths),
      client.query.reactions.statesForPosts(
        pending.map((t) => ({ owner: t.owner, postId: t.postId })),
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
          (viewerRepostResult.status === 'fulfilled'
            ? viewerRepostResult.value
            : []
          ).map((row) => [row.refPath, row])
        );

        const next: EngagementMap = {};
        for (const target of pending) {
          const counts = threadCounts[target.path];
          const reactions = reactionStates[`${target.owner}:${target.postId}`];
          const amplify = amplifyCounts[target.path];
          const viewerRepost = viewerReposts.get(target.path);
          const row: PostEngagement = {
            ...EMPTY_POST_ENGAGEMENT,
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
          next[target.key] = row;
          rememberViewerEngagement(memory, target.key, row);
        }
        if (accountId) rememberOverlay(pending);
        setEngagement((current) => ({
          ...current,
          ...mergeEngagementSoftUpgrade(
            current,
            next,
            pendingReactionKeysRef.current,
            pendingSaveKeysRef.current,
            unrepostedKeysRef.current
          ),
        }));
        setUnrepostedKeys((current) => {
          if (current.size === 0) return current;
          const nextKeys = new Set(current);
          for (const target of pending) {
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
      if (pendingReactionKeysRef.current.has(key)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      /* Read through refs so this callback's identity survives engagement
       * updates — a like on one card must not re-render every other card. */
      const previous = engagementRef.current[key] ?? EMPTY_POST_ENGAGEMENT;
      const applied = !previous.viewerReacted;

      setPendingReactionKeys((current) => new Set(current).add(key));
      const pending = pendingReactionEngagement(previous, applied);
      rememberViewerEngagement(viewerMemoryRef.current, key, pending);
      setEngagement((current) => ({
        ...current,
        [key]: pending,
      }));

      try {
        const { client } = await getClient();
        await client.reactions.toggle(
          { author: post.accountId, postId: post.postId },
          DEFAULT_REACTION_KIND,
          { viewer: accountId, wait: true }
        );
        const expected = reactionCountAfterToggle(
          previous.reactionCount,
          applied
        );
        const reader = createReadOnlyOnSocialClient();
        const indexed = await pollIndexConfirm(
          async () => {
            const counts = await reader.query.reactions.counts(
              post.accountId,
              `post/${post.postId}`
            );
            return counts.total ?? 0;
          },
          (count) => count === expected
        );
        setEngagement((current) => {
          const live = current[key] ?? previous;
          const confirmed = confirmedReactionEngagement(
            { ...live, reactionCount: previous.reactionCount },
            applied
          );
          const row =
            indexed === expected
              ? { ...confirmed, reactionCount: indexed }
              : confirmed;
          rememberViewerEngagement(viewerMemoryRef.current, key, row);
          return {
            ...current,
            [key]: row,
          };
        });
      } catch (cause) {
        rememberViewerEngagement(viewerMemoryRef.current, key, previous);
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
    [accountId, connect, getClient, isConnected]
  );

  const toggleSave = useCallback(
    async (post: PostRow) => {
      const key = postKey(post);
      if (pendingSaveKeysRef.current.has(key)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const previous = engagementRef.current[key] ?? EMPTY_POST_ENGAGEMENT;
      const applied = !previous.viewerSaved;
      const contentPath = postContentPath(post);

      setPendingSaveKeys((current) => new Set(current).add(key));
      const pending = { ...previous, viewerSaved: applied };
      rememberViewerEngagement(viewerMemoryRef.current, key, pending);
      setEngagement((current) => ({
        ...current,
        [key]: pending,
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
        rememberViewerEngagement(viewerMemoryRef.current, key, previous);
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
    [accountId, connect, getClient, isConnected]
  );

  const confirmAmplify = useCallback((post: PostRow) => {
    const key = postKey(post);
    setEngagement((current) => {
      const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
      const row = previous.viewerAmplified
        ? {
            ...previous,
            amplifyCount: previous.amplifyCount + 1,
            amplifyRoll: previous.amplifyRoll + 1,
          }
        : {
            ...previous,
            viewerAmplified: true,
            amplifyCount: previous.amplifyCount + 1,
            amplifyRoll: previous.amplifyRoll + 1,
          };
      rememberViewerEngagement(viewerMemoryRef.current, key, row);
      return { ...current, [key]: row };
    });
    // Invalidate Hot session snapshots — leave/return soft-refetches rank
    // without scrolling the reader to the boosted card.
    recordViewerAmplifyConfirmed(post.accountId);
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
        const row = previous.viewerReposted
          ? {
              ...previous,
              viewerRepostId: viewerRepost.postId,
              viewerRepostGroupId: viewerRepost.groupId ?? null,
            }
          : {
              ...previous,
              viewerReposted: true,
              viewerRepostId: viewerRepost.postId,
              viewerRepostGroupId: viewerRepost.groupId ?? null,
              repostCount: previous.repostCount + 1,
              shareRoll: previous.shareRoll + 1,
            };
        rememberViewerEngagement(viewerMemoryRef.current, key, row);
        return { ...current, [key]: row };
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
      const row: PostEngagement = {
        ...previous,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
        repostCount: Math.max(0, previous.repostCount - 1),
        shareRoll: previous.shareRoll + 1,
      };
      rememberViewerEngagement(viewerMemoryRef.current, key, row);
      return { ...current, [key]: row };
    });
  }, []);

  const confirmQuote = useCallback((post: PostRow) => {
    const key = postKey(post);
    setEngagement((current) => {
      const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
      return {
        ...current,
        [key]: {
          ...previous,
          quoteCount: previous.quoteCount + 1,
          shareRoll: previous.shareRoll + 1,
        },
      };
    });
  }, []);

  const confirmReply = useCallback((post: PostRow) => {
    const key = postKey(post);
    setEngagement((current) => {
      // Feed + each open sheet subscribe — skip maps that never loaded this
      // parent so a reply does not copy a large unrelated engagement object.
      if (!Object.prototype.hasOwnProperty.call(current, key)) return current;
      const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
      return {
        ...current,
        [key]: {
          ...previous,
          replyCount: previous.replyCount + 1,
          replyRoll: previous.replyRoll + 1,
        },
      };
    });
  }, []);

  useEffect(() => {
    const offQuote = subscribePersonalQuoteConfirmed(confirmQuote);
    const offReply = subscribePersonalReplyConfirmed(({ parent }) => {
      confirmReply(parent);
    });
    return () => {
      offQuote();
      offReply();
    };
  }, [confirmQuote, confirmReply]);

  /* Stable identities (read via ref): these run once per card per render,
   * so a changing function identity would defeat memoized cards. */
  const isReactionPending = useCallback(
    (post: PostRow) => pendingReactionKeysRef.current.has(postKey(post)),
    []
  );

  const isSavePending = useCallback(
    (post: PostRow) => pendingSaveKeysRef.current.has(postKey(post)),
    []
  );

  const isSharePending = useCallback(
    (post: PostRow) => pendingShareKeysRef.current.has(postKey(post)),
    []
  );

  const withSharePending = useCallback(
    async <T>(
      post: PostRow,
      task: () => Promise<T>
    ): Promise<T | undefined> => {
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
