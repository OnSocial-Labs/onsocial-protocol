'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  subscribePersonalQuoteConfirmed,
  subscribePersonalReplyConfirmed,
} from '@/features/scarces/drop-compose-host';
import { recordViewerAmplifyConfirmed } from '@/lib/home-feed-amplify-epoch';
import { fillEngagementSeedFromFeedRows } from '@/lib/engagement-row-seed';
import {
  EMPTY_POST_ENGAGEMENT,
  type EngagementMap,
  type PostEngagement,
} from '@/lib/post-engagement-model';
import { postKey } from '@/lib/post-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export type { EngagementMap, PostEngagement } from '@/lib/post-engagement-model';
export { EMPTY_POST_ENGAGEMENT } from '@/lib/post-engagement-model';

const DEFAULT_REACTION_KIND = 'like';

/**
 * Heart moves immediately. The count stays until chain finality (`wait: true`)
 * so a wallet cancel never flashes a number.
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

/** Local like total once the chain confirms the toggle. */
export function reactionCountAfterToggle(
  count: number,
  applied: boolean
): number {
  return Math.max(0, count + (applied ? 1 : -1));
}

/** Count rolls when the like lands on chain — indexer soft-fills elsewhere. */
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
    a.viewerFlagsReady === b.viewerFlagsReady &&
    a.amplifyCountReady === b.amplifyCountReady &&
    a.reactionRoll === b.reactionRoll &&
    a.amplifyRoll === b.amplifyRoll &&
    a.replyRoll === b.replyRoll &&
    a.shareRoll === b.shareRoll
  );
}

/**
 * Drop keys that left the retain set (in-memory feed list). Fetch still
 * targets the near band — retain stays wider so seed counts are not pruned
 * before scroll-back remounts them.
 */
export function pruneEngagementMap(
  current: EngagementMap,
  retainKeys: ReadonlySet<string>
): EngagementMap {
  let changed = false;
  const next: EngagementMap = {};
  for (const [key, row] of Object.entries(current)) {
    if (retainKeys.has(key)) next[key] = row;
    else changed = true;
  }
  return changed ? next : current;
}

/**
 * Last-good engagement that survives feed window prune. Seed + this map paint
 * counts and viewer colour on scroll-back in the same frame — never wait for
 * scroll settle or a network round-trip for a row we already knew.
 */
export function rememberEngagementLastGood(
  store: Map<string, PostEngagement>,
  key: string,
  row: PostEngagement
): void {
  store.set(key, row);
}

/**
 * Resolve the live band for paint. Prefer the live map; fill pruned keys from
 * seed (public counts) + last-good (viewer flags / confirmed bumps) before
 * any effect runs.
 */
export function resolveBandEngagement(input: {
  live: EngagementMap;
  seed: EngagementMap | null;
  lastGood: ReadonlyMap<string, PostEngagement>;
  keys: readonly string[];
}): EngagementMap {
  let changed = false;
  const next: EngagementMap = { ...input.live };
  for (const key of input.keys) {
    // Live band row is authoritative (includes unlike / unrepost optimism).
    if (key in next) continue;
    const good = input.lastGood.get(key);
    const seeded = input.seed?.[key];
    if (seeded && good) {
      const amplifyCountReady =
        good.amplifyCountReady || seeded.amplifyCountReady;
      next[key] = {
        ...seeded,
        viewerReacted: good.viewerReacted,
        viewerAmplified: good.viewerAmplified,
        viewerSaved: good.viewerSaved,
        viewerReposted: good.viewerReposted,
        viewerRepostId: good.viewerRepostId,
        viewerRepostGroupId: good.viewerRepostGroupId,
        viewerFlagsReady: good.viewerFlagsReady || seeded.viewerFlagsReady,
        amplifyCountReady,
        replyCount: Math.max(seeded.replyCount, good.replyCount),
        quoteCount: Math.max(seeded.quoteCount, good.quoteCount),
        repostCount: Math.max(seeded.repostCount, good.repostCount),
        reactionCount: Math.max(seeded.reactionCount, good.reactionCount),
        amplifyCount: amplifyCountReady
          ? Math.max(
              good.amplifyCountReady ? good.amplifyCount : 0,
              seeded.amplifyCountReady ? seeded.amplifyCount : 0
            )
          : Math.max(seeded.amplifyCount, good.amplifyCount),
        reactionRoll: good.reactionRoll,
        amplifyRoll: good.amplifyRoll,
        replyRoll: good.replyRoll,
        shareRoll: good.shareRoll,
      };
      changed = true;
      continue;
    }
    if (seeded) {
      next[key] = seeded;
      changed = true;
      continue;
    }
    if (good) {
      next[key] = good;
      changed = true;
    }
  }
  return changed ? next : input.live;
}

export type ViewerOverlayPatch = {
  viewerReacted: boolean;
  viewerSaved: boolean;
  viewerAmplified: boolean;
  viewerReposted: boolean;
  viewerRepostId: string | null;
  viewerRepostGroupId: string | null;
  /** Public amplify total from the same pass as viewer amplify colour. */
  amplifyCount?: number;
};

/**
 * Apply a late viewer-colour read onto a live row without undoing an in-flight
 * or chain-confirmed like/save (or a known unrepost). Amplify colour and total
 * land together when `amplifyCount` is present — never lit fire with no digit.
 */
export function applyViewerOverlayEngagement(
  previous: PostEngagement,
  overlay: ViewerOverlayPatch,
  opts: {
    pendingReaction: boolean;
    pendingSave: boolean;
    unreposted: boolean;
  }
): PostEngagement {
  let viewerReacted = overlay.viewerReacted;
  if (opts.pendingReaction) {
    viewerReacted = previous.viewerReacted;
  } else if (
    previous.reactionRoll > 0 &&
    previous.viewerReacted !== overlay.viewerReacted
  ) {
    viewerReacted = previous.viewerReacted;
  }

  let viewerSaved = overlay.viewerSaved || previous.viewerSaved;
  if (opts.pendingSave) {
    viewerSaved = previous.viewerSaved;
  }

  let viewerReposted = overlay.viewerReposted || previous.viewerReposted;
  let viewerRepostId = overlay.viewerRepostId ?? previous.viewerRepostId;
  let viewerRepostGroupId =
    overlay.viewerRepostGroupId ?? previous.viewerRepostGroupId;
  if (opts.unreposted) {
    viewerReposted = false;
    viewerRepostId = null;
    viewerRepostGroupId = null;
  } else if (previous.viewerReposted && !overlay.viewerReposted) {
    viewerReposted = true;
    viewerRepostId = previous.viewerRepostId;
    viewerRepostGroupId = previous.viewerRepostGroupId;
  }

  const viewerAmplified =
    overlay.viewerAmplified || previous.viewerAmplified;
  let amplifyCount = previous.amplifyCount;
  let amplifyCountReady = previous.amplifyCountReady;
  if (overlay.amplifyCount != null) {
    amplifyCount = Math.max(previous.amplifyCount, overlay.amplifyCount);
    amplifyCountReady = true;
  }
  // Colour implies at least one amplify — never settle 0 + active fire.
  if (viewerAmplified && amplifyCountReady) {
    amplifyCount = Math.max(amplifyCount, 1);
  }

  return {
    ...previous,
    viewerReacted,
    viewerSaved,
    viewerAmplified,
    amplifyCount,
    amplifyCountReady,
    viewerReposted,
    viewerRepostId,
    viewerRepostGroupId,
    viewerFlagsReady: true,
  };
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
    // Public-count seed must not wipe known viewer colour.
    if (previous?.viewerFlagsReady && !next.viewerFlagsReady) {
      next = {
        ...next,
        viewerReacted: previous.viewerReacted,
        viewerSaved: previous.viewerSaved,
        viewerAmplified: previous.viewerAmplified,
        viewerReposted: previous.viewerReposted,
        viewerRepostId: previous.viewerRepostId,
        viewerRepostGroupId: previous.viewerRepostGroupId,
        viewerFlagsReady: true,
      };
    } else if (previous?.viewerFlagsReady || next.viewerFlagsReady) {
      next = { ...next, viewerFlagsReady: true };
    }
    if (previous?.amplifyCountReady && !next.amplifyCountReady) {
      next = {
        ...next,
        amplifyCount: previous.amplifyCount,
        amplifyCountReady: true,
      };
    } else if (previous?.amplifyCountReady && next.amplifyCountReady) {
      next = {
        ...next,
        amplifyCount: Math.max(next.amplifyCount, previous.amplifyCount),
      };
    }
    if (previous && pendingReactionKeys.has(key)) {
      next = {
        ...next,
        viewerReacted: previous.viewerReacted,
        reactionCount: previous.reactionCount,
      };
    } else if (
      previous &&
      previous.reactionRoll > 0 &&
      previous.viewerReacted !== next.viewerReacted
    ) {
      // After a chain confirm, keep live until the indexer agrees — first
      // colour soft-fill (reactionRoll 0) still applies viewer flags.
      next = {
        ...next,
        viewerReacted: previous.viewerReacted,
        reactionCount: previous.reactionCount,
      };
    } else if (previous?.viewerReacted && next.viewerReacted) {
      // Same liked state: never dip below the confirmed local total.
      next = {
        ...next,
        reactionCount: Math.max(next.reactionCount, previous.reactionCount),
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
        amplifyCountReady: true,
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
 * `initial` + public fields on `retainPosts`/`posts` seed counts on first
 * paint (every caller — home, discover, portfolio). Overlay loads viewer
 * colour without scroll-cancel; last-good keeps both across prune.
 * `posts` = near fetch band; `retainPosts` = full list so prune follows trim.
 */
export function usePostEngagement(
  posts: PostRow[],
  opts: {
    initial?: EngagementMap | null;
    /** Keys that must stay in the live map — usually the full feed list. */
    retainPosts?: readonly PostRow[];
    onError?: (message: string) => void;
  } = {}
) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const retainPosts = opts.retainPosts;
  const seedPosts = retainPosts ?? posts;
  const seededInitial = useMemo(
    () => fillEngagementSeedFromFeedRows(opts.initial ?? null, seedPosts),
    [opts.initial, seedPosts]
  );
  const [engagement, setEngagement] = useState<EngagementMap>(
    () => seededInitial
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
  const initialRef = useRef<EngagementMap | null>(seededInitial);
  const viewerOverlayRef = useRef<{
    accountId: string;
    keys: Set<string>;
  } | null>(null);
  /** Survives prune — scroll-back paints counts + colour without waiting. */
  const lastGoodRef = useRef<Map<string, PostEngagement>>(new Map());
  const lastGoodAccountRef = useRef<string | null>(accountId ?? null);
  if (lastGoodAccountRef.current !== (accountId ?? null)) {
    lastGoodAccountRef.current = accountId ?? null;
    lastGoodRef.current.clear();
    viewerOverlayRef.current = null;
  }
  const incomingInitial = seededInitial;
  if (incomingInitial !== initialRef.current) {
    initialRef.current = incomingInitial;
    if (Object.keys(incomingInitial).length > 0) {
      const lastGood = lastGoodRef.current;
      const seedKeys = Object.keys(incomingInitial);
      setEngagement((prev) => {
        const filled = resolveBandEngagement({
          live: prev,
          seed: incomingInitial,
          lastGood,
          keys: seedKeys,
        });
        const upgraded = mergeEngagementSoftUpgrade(
          filled,
          incomingInitial,
          pendingReactionKeysRef.current,
          pendingSaveKeysRef.current,
          unrepostedKeysRef.current
        );
        let changed = filled !== prev;
        const next: EngagementMap = { ...filled };
        for (const [key, row] of Object.entries(upgraded)) {
          if (next[key] !== row) {
            next[key] = row;
            changed = true;
          }
          rememberEngagementLastGood(lastGood, key, next[key]!);
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
  const retainKeys = useMemo(() => {
    const rows = retainPosts ?? posts;
    return new Set(rows.map((post) => postKey(post)));
  }, [retainPosts, posts]);
  const retainSignature = useMemo(
    () => [...retainKeys].join('\n'),
    [retainKeys]
  );

  // Bound the map to the feed list (retain), not only the near fetch band.
  useEffect(() => {
    const lastGood = lastGoodRef.current;
    setEngagement((current) => {
      for (const [key, row] of Object.entries(current)) {
        if (!retainKeys.has(key)) {
          rememberEngagementLastGood(lastGood, key, row);
        }
      }
      return pruneEngagementMap(current, retainKeys);
    });
    const overlay = viewerOverlayRef.current;
    if (!overlay) return;
    for (const key of [...overlay.keys]) {
      if (!retainKeys.has(key)) overlay.keys.delete(key);
    }
  }, [retainSignature, retainKeys]);

  useEffect(() => {
    if (targets.length === 0) {
      return;
    }

    const lastGood = lastGoodRef.current;
    const seed = initialRef.current;
    const known = engagementRef.current;
    // Row seed / last-good already own public counts — do not recount those.
    const missing = targets.filter((target) => {
      if (target.key in known) return false;
      if (seed?.[target.key]) return false;
      if (lastGood.has(target.key)) return false;
      return true;
    });
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

    // Warm live map from seed + last-good before any network (scroll-back).
    if (seed || lastGood.size > 0) {
      setEngagement((current) =>
        resolveBandEngagement({
          live: current,
          seed,
          lastGood,
          keys: targets.map((target) => target.key),
        })
      );
    }

    // Counts already on the row stay. A signed-in viewer only picks up
    // their own like, save, and repost — a recount would roll the numbers.
    // Overlay must not use loadId cancel: scroll thrash was dropping colour.
    if (missing.length === 0) {
      if (overlayFor.length === 0 || !accountId) return;
      const viewerId = accountId;
      const client = createReadOnlyOnSocialClient();
      const paths = overlayFor.map((target) => target.path);
      const overlayRows = overlayFor;
      // Counts + viewer amplify in one pass so fire colour never paints alone.
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
        ([
          reactionResult,
          savesResult,
          viewerRepostResult,
          amplifyResult,
        ]) => {
          if (lastGoodAccountRef.current !== viewerId) return;
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
            let changed = false;
            const next: EngagementMap = { ...current };
            const pendingReactions = pendingReactionKeysRef.current;
            const pendingSaves = pendingSaveKeysRef.current;
            const unreposted = unrepostedKeysRef.current;
            for (const target of overlayRows) {
              const previous = current[target.key];
              if (!previous) continue;
              const reactions =
                reactionStates[`${target.owner}:${target.postId}`];
              const viewerRepost = viewerReposts.get(target.path);
              const amplify = amplifyCounts[target.path];
              const row = applyViewerOverlayEngagement(
                previous,
                {
                  viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
                  viewerSaved: savedPaths.has(target.path),
                  viewerAmplified: Boolean(amplify?.viewerAmplified),
                  viewerReposted: Boolean(viewerRepost),
                  viewerRepostId: viewerRepost?.repostId ?? null,
                  viewerRepostGroupId: viewerRepost?.groupId ?? null,
                  amplifyCount: amplify?.amplifyCount,
                },
                {
                  pendingReaction: pendingReactions.has(target.key),
                  pendingSave: pendingSaves.has(target.key),
                  unreposted: unreposted.has(target.key),
                }
              );
              if (samePostEngagement(previous, row)) continue;
              next[target.key] = row;
              rememberEngagementLastGood(lastGood, target.key, row);
              changed = true;
            }
            return changed ? next : current;
          });
        }
      );
      return;
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
            amplifyCountReady: true,
            viewerAmplified: amplify?.viewerAmplified ?? false,
            viewerSaved: savedPaths.has(target.path),
            viewerReposted: Boolean(viewerRepost),
            viewerRepostId: viewerRepost?.repostId ?? null,
            viewerRepostGroupId: viewerRepost?.groupId ?? null,
            viewerFlagsReady: true,
          };
          next[target.key] = row;
          rememberEngagementLastGood(lastGood, target.key, row);
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
      // Signed-in colour not painted yet — never invert a grey heart.
      if (!previous.viewerFlagsReady) return;
      const applied = !previous.viewerReacted;

      setPendingReactionKeys((current) => new Set(current).add(key));
      const pending = pendingReactionEngagement(previous, applied);
      rememberEngagementLastGood(lastGoodRef.current, key, pending);
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
        // Chain finality is confirm — roll the count; indexer soft-fills later.
        setEngagement((current) => {
          const live = current[key] ?? previous;
          const row = confirmedReactionEngagement(
            { ...live, reactionCount: previous.reactionCount },
            applied
          );
          rememberEngagementLastGood(lastGoodRef.current, key, row);
          return {
            ...current,
            [key]: row,
          };
        });
      } catch (cause) {
        rememberEngagementLastGood(lastGoodRef.current, key, previous);
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
      if (!previous.viewerFlagsReady) return;
      const applied = !previous.viewerSaved;
      const contentPath = postContentPath(post);

      setPendingSaveKeys((current) => new Set(current).add(key));
      const pending = { ...previous, viewerSaved: applied };
      rememberEngagementLastGood(lastGoodRef.current, key, pending);
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
        rememberEngagementLastGood(lastGoodRef.current, key, previous);
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
            amplifyCountReady: true,
            amplifyRoll: previous.amplifyRoll + 1,
          }
        : {
            ...previous,
            viewerAmplified: true,
            amplifyCount: previous.amplifyCount + 1,
            amplifyCountReady: true,
            amplifyRoll: previous.amplifyRoll + 1,
          };
      rememberEngagementLastGood(lastGoodRef.current, key, row);
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
        rememberEngagementLastGood(lastGoodRef.current, key, row);
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
      rememberEngagementLastGood(lastGoodRef.current, key, row);
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

  /*
   * Same-frame band paint: seed + last-good fill pruned keys before effects.
   * Scroll must not blank counts or active colour until a fetch settles.
   */
  const paintedEngagement = useMemo(
    () =>
      resolveBandEngagement({
        live: engagement,
        seed: initialRef.current,
        lastGood: lastGoodRef.current,
        keys: targets.map((target) => target.key),
      }),
    [engagement, targets, incomingInitial]
  );

  return {
    engagement: paintedEngagement,
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
