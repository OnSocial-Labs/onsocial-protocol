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
 * Like/save/amplify confirm must not land on a different wallet after a
 * mid-flight account switch (or logout).
 */
export function shouldApplyViewerToggleConfirm(
  activeAccountId: string | null,
  viewerIdAtStart: string
): boolean {
  return activeAccountId === viewerIdAtStart;
}

/**
 * Soft-fill amplify totals were requested for this account (or signed-out).
 * Skip the `then` when the wallet changed while the query was in flight.
 */
export function shouldApplyAmplifyCountFill(
  activeAccountId: string | null,
  requestedAccountId: string | null
): boolean {
  return activeAccountId === requestedAccountId;
}

/**
 * Overlay amplify: count query only for rows still missing a total; colour
 * query for the rest. Avoids re-fetching totals for the whole band.
 */
export function partitionOverlayAmplifyPaths(
  rows: readonly { key: string; path: string }[],
  engagement: EngagementMap
): { countPaths: string[]; colourPaths: string[] } {
  const countPaths: string[] = [];
  const colourPaths: string[] = [];
  for (const row of rows) {
    if (engagement[row.key]?.amplifyCountReady) {
      colourPaths.push(row.path);
    } else {
      countPaths.push(row.path);
    }
  }
  return { countPaths, colourPaths };
}

/** Chain-confirmed amplify — bump count and colour for the signing viewer. */
export function confirmedAmplifyEngagement(
  previous: PostEngagement
): PostEngagement {
  return previous.viewerAmplified
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
}

/**
 * Soft-fill still owes a recount until each public-count lane has loaded.
 * Used by the missing filter so a failed likes (or threads) read cannot
 * lock a false 0 and drop the row from retry.
 */
export function engagementNeedsCountSoftFill(
  row: PostEngagement | null | undefined
): boolean {
  if (!row) return true;
  return !row.threadCountsReady || !row.reactionCountReady;
}

/**
 * Soft-fill row from settled query parts. Keep counts that loaded; mark each
 * lane ready only when that query succeeded (or was already ready).
 */
export function engagementFromPartialFetch(input: {
  previous: PostEngagement | null | undefined;
  threadsOk: boolean;
  reactionsOk: boolean;
  amplifyOk: boolean;
  viewerReady: boolean;
  repostsOk: boolean;
  counts?: {
    replyCount: number;
    quoteCount: number;
    repostCount: number;
  } | null;
  reactionTotal?: number;
  viewerReacted?: boolean;
  amplifyCount?: number;
  viewerAmplified?: boolean;
  viewerSaved?: boolean;
  viewerReposted?: boolean;
  viewerRepostId?: string | null;
  viewerRepostGroupId?: string | null;
}): PostEngagement {
  const previous = input.previous;
  const threadCountsReady =
    input.threadsOk || Boolean(previous?.threadCountsReady);
  const reactionCountReady =
    input.reactionsOk || Boolean(previous?.reactionCountReady);
  const row: PostEngagement = {
    ...EMPTY_POST_ENGAGEMENT,
    replyCount: input.threadsOk
      ? (input.counts?.replyCount ?? 0)
      : (previous?.replyCount ?? 0),
    quoteCount: input.threadsOk
      ? (input.counts?.quoteCount ?? 0)
      : (previous?.quoteCount ?? 0),
    repostCount: input.threadsOk
      ? (input.counts?.repostCount ?? 0)
      : (previous?.repostCount ?? 0),
    reactionCount: input.reactionsOk
      ? (input.reactionTotal ?? 0)
      : (previous?.reactionCount ?? 0),
    threadCountsReady,
    reactionCountReady,
    viewerReacted: input.viewerReady
      ? Boolean(input.viewerReacted)
      : (previous?.viewerReacted ?? false),
    amplifyCount: input.amplifyOk
      ? (input.amplifyCount ?? 0)
      : (previous?.amplifyCount ?? 0),
    amplifyCountReady: input.amplifyOk || Boolean(previous?.amplifyCountReady),
    viewerAmplified: input.amplifyOk
      ? Boolean(input.viewerAmplified)
      : (previous?.viewerAmplified ?? false),
    viewerSaved: input.viewerReady
      ? Boolean(input.viewerSaved)
      : (previous?.viewerSaved ?? false),
    viewerReposted:
      input.viewerReady && input.repostsOk
        ? Boolean(input.viewerReposted)
        : (previous?.viewerReposted ?? false),
    viewerRepostId:
      input.viewerReady && input.repostsOk
        ? (input.viewerRepostId ?? null)
        : (previous?.viewerRepostId ?? null),
    viewerRepostGroupId:
      input.viewerReady && input.repostsOk
        ? (input.viewerRepostGroupId ?? null)
        : (previous?.viewerRepostGroupId ?? null),
    viewerFlagsReady:
      input.viewerReady && input.repostsOk && input.amplifyOk,
    reactionRoll: previous?.reactionRoll ?? 0,
    saveRoll: previous?.saveRoll ?? 0,
    amplifyRoll: previous?.amplifyRoll ?? 0,
    replyRoll: previous?.replyRoll ?? 0,
    shareRoll: previous?.shareRoll ?? 0,
  };
  if (row.viewerAmplified && row.amplifyCountReady) {
    row.amplifyCount = Math.max(row.amplifyCount, 1);
  }
  return row;
}

/**
 * Drop viewer colour / rolls when the wallet changes (including logout).
 * Public counts stay so the row does not flash empty.
 */
export function engagementForAccountChange(
  current: EngagementMap,
  nextAccountId: string | null
): EngagementMap {
  const next: EngagementMap = {};
  const signedOut = nextAccountId == null;
  for (const [key, row] of Object.entries(current)) {
    next[key] = {
      ...row,
      viewerReacted: false,
      viewerAmplified: false,
      viewerSaved: false,
      viewerReposted: false,
      viewerRepostId: null,
      viewerRepostGroupId: null,
      viewerFlagsReady: signedOut,
      reactionRoll: 0,
      saveRoll: 0,
      amplifyRoll: 0,
      replyRoll: 0,
      shareRoll: 0,
    };
  }
  return next;
}

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
    reactionCountReady: true,
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
    a.threadCountsReady === b.threadCountsReady &&
    a.reactionCountReady === b.reactionCountReady &&
    a.reactionRoll === b.reactionRoll &&
    a.saveRoll === b.saveRoll &&
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
      const threadCountsReady =
        good.threadCountsReady || seeded.threadCountsReady;
      const reactionCountReady =
        good.reactionCountReady || seeded.reactionCountReady;
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
        threadCountsReady,
        reactionCountReady,
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
        saveRoll: good.saveRoll,
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
  /** Like total when the soft-fill lane had never succeeded. */
  reactionCount?: number;
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

  let viewerSaved = overlay.viewerSaved;
  if (opts.pendingSave) {
    viewerSaved = previous.viewerSaved;
  } else if (
    previous.saveRoll > 0 &&
    previous.viewerSaved !== overlay.viewerSaved
  ) {
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

  let reactionCount = previous.reactionCount;
  let reactionCountReady = previous.reactionCountReady;
  if (overlay.reactionCount != null) {
    reactionCount = Math.max(previous.reactionCount, overlay.reactionCount);
    reactionCountReady = true;
  }

  return {
    ...previous,
    viewerReacted,
    viewerSaved,
    viewerAmplified,
    amplifyCount,
    amplifyCountReady,
    reactionCount,
    reactionCountReady,
    viewerReposted,
    viewerRepostId,
    viewerRepostGroupId,
    // Ready only when this pass had a real viewer read — callers gate that.
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
    if (previous?.threadCountsReady && !next.threadCountsReady) {
      next = {
        ...next,
        replyCount: previous.replyCount,
        quoteCount: previous.quoteCount,
        repostCount: previous.repostCount,
        threadCountsReady: true,
      };
    } else if (previous?.threadCountsReady && next.threadCountsReady) {
      next = {
        ...next,
        replyCount: Math.max(next.replyCount, previous.replyCount),
        quoteCount: Math.max(next.quoteCount, previous.quoteCount),
        repostCount: Math.max(next.repostCount, previous.repostCount),
      };
    }
    if (previous?.reactionCountReady && !next.reactionCountReady) {
      next = {
        ...next,
        reactionCount: previous.reactionCount,
        reactionCountReady: true,
      };
    } else if (previous?.reactionCountReady && next.reactionCountReady) {
      next = {
        ...next,
        reactionCount: Math.max(next.reactionCount, previous.reactionCount),
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
    } else if (
      previous &&
      previous.saveRoll > 0 &&
      previous.viewerSaved !== next.viewerSaved
    ) {
      // Confirmed save/unsave holds until the indexer agrees.
      next = {
        ...next,
        viewerSaved: previous.viewerSaved,
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
      saveRoll: previous.saveRoll,
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
  const [fetchRetryEpoch, setFetchRetryEpoch] = useState(0);
  const fetchRetryCountRef = useRef(0);
  const fetchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFetchRetry = () => {
    if (fetchRetryTimerRef.current) return;
    if (fetchRetryCountRef.current >= 3) {
      // Cool down, then allow another wave — never lock likes for the session.
      fetchRetryTimerRef.current = setTimeout(() => {
        fetchRetryTimerRef.current = null;
        fetchRetryCountRef.current = 0;
        setFetchRetryEpoch((epoch) => epoch + 1);
      }, 15_000);
      return;
    }
    fetchRetryCountRef.current += 1;
    const delayMs = 1_200 * fetchRetryCountRef.current;
    fetchRetryTimerRef.current = setTimeout(() => {
      fetchRetryTimerRef.current = null;
      setFetchRetryEpoch((epoch) => epoch + 1);
    }, delayMs);
  };
  if (lastGoodAccountRef.current !== (accountId ?? null)) {
    const nextAccount = accountId ?? null;
    lastGoodAccountRef.current = nextAccount;
    // Invalidate in-flight soft-fills so a late then() cannot paint the
    // previous wallet's likes onto this account.
    loadIdRef.current += 1;
    lastGoodRef.current.clear();
    viewerOverlayRef.current = null;
    fetchRetryCountRef.current = 0;
    if (fetchRetryTimerRef.current) {
      clearTimeout(fetchRetryTimerRef.current);
      fetchRetryTimerRef.current = null;
    }
    pendingReactionKeysRef.current = new Set();
    pendingSaveKeysRef.current = new Set();
    unrepostedKeysRef.current = new Set();
    pendingShareKeysRef.current = new Set();
    setPendingReactionKeys(new Set());
    setPendingSaveKeys(new Set());
    setUnrepostedKeys(new Set());
    setPendingShareKeys(new Set());
    setEngagement((prev) => engagementForAccountChange(prev, nextAccount));
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
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
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
    // Soft-fill until each public-count lane is ready — a failed likes
    // (or threads) read must not lock a false 0 and leave the filter.
    const missing = targets.filter((target) => {
      const row =
        known[target.key] ?? seed?.[target.key] ?? lastGood.get(target.key);
      return engagementNeedsCountSoftFill(row);
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

    const client = createReadOnlyOnSocialClient();

    // Public amplify totals when the feed row omitted them (signed-out too).
    // Signed-in overlay keys fetch counts in that batch — skip a double read.
    const overlayKeySet = new Set(overlayFor.map((target) => target.key));
    const amplifyFillFor = targets.filter((target) => {
      const row =
        known[target.key] ?? seed?.[target.key] ?? lastGood.get(target.key);
      if (row == null || row.amplifyCountReady) return false;
      if (accountId && overlayKeySet.has(target.key)) return false;
      return true;
    });
    if (amplifyFillFor.length > 0) {
      const fillRows = amplifyFillFor;
      const fillPaths = fillRows.map((target) => target.path);
      const fillAccountId = accountId ?? null;
      void client.query.socialSpend
        .amplifyCountsForPostPaths(
          fillPaths,
          fillAccountId ? { viewer: fillAccountId } : {}
        )
        .then((amplifyCounts) => {
          if (
            !shouldApplyAmplifyCountFill(
              lastGoodAccountRef.current,
              fillAccountId
            )
          ) {
            return;
          }
          setEngagement((current) => {
            let changed = false;
            const next: EngagementMap = { ...current };
            for (const target of fillRows) {
              if (!targetsRef.current.some((row) => row.key === target.key)) {
                continue;
              }
              const previous = current[target.key];
              if (!previous || previous.amplifyCountReady) continue;
              const amplify = amplifyCounts[target.path];
              const amplifyCount = Math.max(
                amplify?.amplifyCount ?? 0,
                previous.viewerAmplified || amplify?.viewerAmplified ? 1 : 0
              );
              const row: PostEngagement = {
                ...previous,
                amplifyCount,
                amplifyCountReady: true,
                viewerAmplified:
                  previous.viewerAmplified ||
                  Boolean(amplify?.viewerAmplified),
              };
              if (samePostEngagement(previous, row)) continue;
              next[target.key] = row;
              rememberEngagementLastGood(lastGood, target.key, row);
              changed = true;
            }
            return changed ? next : current;
          });
        })
        .catch(() => {
          scheduleFetchRetry();
        });
    }

    // Counts already on the row stay. A signed-in viewer only picks up
    // their own like, save, and repost — a recount would roll the numbers.
    // Overlay must not use loadId cancel: scroll thrash was dropping colour.
    if (missing.length === 0) {
      if (overlayFor.length === 0 || !accountId) return;
      const viewerId = accountId;
      const paths = overlayFor.map((target) => target.path);
      const overlayRows = overlayFor;
      const { countPaths, colourPaths } = partitionOverlayAmplifyPaths(
        overlayRows,
        engagementRef.current
      );
      const countPathSet = new Set(countPaths);
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
        countPaths.length > 0
          ? client.query.socialSpend.amplifyCountsForPostPaths(countPaths, {
              viewer: viewerId,
            })
          : Promise.resolve(
              {} as Record<
                string,
                { amplifyCount: number; viewerAmplified: boolean }
              >
            ),
        colourPaths.length > 0
          ? client.query.socialSpend.viewerAmplifiedForPostPaths(
              viewerId,
              colourPaths
            )
          : Promise.resolve({} as Record<string, boolean>),
      ]).then(
        ([
          reactionResult,
          savesResult,
          viewerRepostResult,
          amplifyCountsResult,
          amplifyColourResult,
        ]) => {
          if (lastGoodAccountRef.current !== viewerId) return;
          if (
            reactionResult.status !== 'fulfilled' ||
            savesResult.status !== 'fulfilled' ||
            viewerRepostResult.status !== 'fulfilled' ||
            amplifyCountsResult.status !== 'fulfilled' ||
            amplifyColourResult.status !== 'fulfilled'
          ) {
            // Do not mark overlay done — failed amplify/repost must retry.
            scheduleFetchRetry();
            return;
          }
          fetchRetryCountRef.current = 0;
          const reactionStates = reactionResult.value;
          const savedPaths = new Set(
            savesResult.value.map((row) => row.contentPath)
          );
          const viewerReposts = new Map(
            viewerRepostResult.value.map((row) => [row.refPath, row])
          );
          const amplifyCounts = amplifyCountsResult.value;
          const amplifyColour = amplifyColourResult.value;
          const liveKeys = new Set(targetsRef.current.map((row) => row.key));
          const painted: typeof overlayRows = [];
          setEngagement((current) => {
            let changed = false;
            const next: EngagementMap = { ...current };
            const pendingReactions = pendingReactionKeysRef.current;
            const pendingSaves = pendingSaveKeysRef.current;
            const unreposted = unrepostedKeysRef.current;
            for (const target of overlayRows) {
              if (!liveKeys.has(target.key)) continue;
              const previous = current[target.key];
              if (!previous) continue;
              const reactions =
                reactionStates[`${target.owner}:${target.postId}`];
              const viewerRepost = viewerReposts.get(target.path);
              let viewerAmplified = previous.viewerAmplified;
              let amplifyCount: number | undefined;
              if (countPathSet.has(target.path)) {
                const amplify = amplifyCounts[target.path];
                viewerAmplified = Boolean(amplify?.viewerAmplified);
                amplifyCount = amplify?.amplifyCount;
              } else {
                viewerAmplified = Boolean(amplifyColour[target.path]);
              }
              const row = applyViewerOverlayEngagement(
                previous,
                {
                  viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
                  viewerSaved: savedPaths.has(target.path),
                  viewerAmplified,
                  viewerReposted: Boolean(viewerRepost),
                  viewerRepostId: viewerRepost?.repostId ?? null,
                  viewerRepostGroupId: viewerRepost?.groupId ?? null,
                  amplifyCount,
                  ...(previous.reactionCountReady
                    ? {}
                    : {
                        reactionCount: reactions?.counts.total ?? 0,
                      }),
                },
                {
                  pendingReaction: pendingReactions.has(target.key),
                  pendingSave: pendingSaves.has(target.key),
                  unreposted: unreposted.has(target.key),
                }
              );
              painted.push(target);
              if (samePostEngagement(previous, row)) continue;
              next[target.key] = row;
              rememberEngagementLastGood(lastGood, target.key, row);
              changed = true;
            }
            return changed ? next : current;
          });
          rememberOverlay(painted);
        }
      );
      return;
    }

    const loadId = ++loadIdRef.current;
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
          scheduleFetchRetry();
          return;
        }

        const threadsOk = threadResult.status === 'fulfilled';
        const reactionsOk = reactionResult.status === 'fulfilled';
        const amplifyOk = amplifyResult.status === 'fulfilled';
        const savesOk =
          !accountId || savesResult.status === 'fulfilled';
        const viewerReady = accountId ? reactionsOk && savesOk : true;
        if (accountId && !viewerReady) {
          scheduleFetchRetry();
        } else {
          fetchRetryCountRef.current = 0;
        }

        const threadCounts = threadsOk ? threadResult.value : {};
        const reactionStates = reactionsOk ? reactionResult.value : {};
        const amplifyCounts = amplifyOk ? amplifyResult.value : {};
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

        const liveKeys = new Set(targetsRef.current.map((row) => row.key));
        const next: EngagementMap = {};
        const overlayPainted: typeof pending = [];
        const repostsOk =
          !accountId || viewerRepostResult.status === 'fulfilled';
        // Partial success still retries until every count lane is ready.
        if (!reactionsOk || !threadsOk) {
          scheduleFetchRetry();
        }
        for (const target of pending) {
          if (!liveKeys.has(target.key)) continue;
          const counts = threadCounts[target.path];
          const reactions = reactionStates[`${target.owner}:${target.postId}`];
          const amplify = amplifyCounts[target.path];
          const viewerRepost = viewerReposts.get(target.path);
          const previous = engagementRef.current[target.key];
          const row = engagementFromPartialFetch({
            previous,
            threadsOk,
            reactionsOk,
            amplifyOk,
            viewerReady,
            repostsOk,
            counts: counts
              ? {
                  replyCount: counts.replyCount,
                  quoteCount: counts.quoteCount,
                  repostCount: counts.repostCount,
                }
              : null,
            reactionTotal: reactions?.counts.total,
            viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
            amplifyCount: amplify?.amplifyCount,
            viewerAmplified: amplify?.viewerAmplified,
            viewerSaved: savedPaths.has(target.path),
            viewerReposted: Boolean(viewerRepost),
            viewerRepostId: viewerRepost?.repostId ?? null,
            viewerRepostGroupId: viewerRepost?.groupId ?? null,
          });
          next[target.key] = row;
          rememberEngagementLastGood(lastGood, target.key, row);
          if (engagementNeedsCountSoftFill(row)) {
            scheduleFetchRetry();
          }
          if (row.viewerFlagsReady) overlayPainted.push(target);
          else if (accountId) scheduleFetchRetry();
        }
        if (accountId && overlayPainted.length > 0) {
          rememberOverlay(overlayPainted);
        }
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
    return () => {
      if (fetchRetryTimerRef.current) {
        clearTimeout(fetchRetryTimerRef.current);
        fetchRetryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsSignature, fetchRetryEpoch]);

  const toggleReaction = useCallback(
    async (post: PostRow) => {
      const key = postKey(post);
      if (pendingReactionKeysRef.current.has(key)) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const viewerId = accountId;
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
          { viewer: viewerId, wait: true }
        );
        // Account switched mid-flight — do not confirm onto the new viewer.
        if (!shouldApplyViewerToggleConfirm(lastGoodAccountRef.current, viewerId)) {
          return;
        }
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
        if (!shouldApplyViewerToggleConfirm(lastGoodAccountRef.current, viewerId)) {
          return;
        }
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
        if (shouldApplyViewerToggleConfirm(lastGoodAccountRef.current, viewerId)) {
          setPendingReactionKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
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

      const viewerId = accountId;
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
          viewer: viewerId,
          wait: true,
        });
        if (!shouldApplyViewerToggleConfirm(lastGoodAccountRef.current, viewerId)) {
          return;
        }
        setEngagement((current) => {
          const live = current[key] ?? previous;
          const row = {
            ...live,
            viewerSaved: applied,
            saveRoll: live.saveRoll + 1,
          };
          rememberEngagementLastGood(lastGoodRef.current, key, row);
          return { ...current, [key]: row };
        });
      } catch (cause) {
        if (!shouldApplyViewerToggleConfirm(lastGoodAccountRef.current, viewerId)) {
          return;
        }
        rememberEngagementLastGood(lastGoodRef.current, key, previous);
        setEngagement((current) => ({ ...current, [key]: previous }));
        if (!isWalletUserCancellation(cause)) {
          onErrorRef.current?.(
            cause instanceof Error ? cause.message : 'Could not update save.'
          );
        }
      } finally {
        if (shouldApplyViewerToggleConfirm(lastGoodAccountRef.current, viewerId)) {
          setPendingSaveKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [accountId, connect, getClient, isConnected]
  );

  const confirmAmplify = useCallback(
    (post: PostRow, detail: { signerId: string }) => {
      if (
        !shouldApplyViewerToggleConfirm(
          lastGoodAccountRef.current,
          detail.signerId
        )
      ) {
        return;
      }
      const key = postKey(post);
      setEngagement((current) => {
        const previous = current[key] ?? EMPTY_POST_ENGAGEMENT;
        const row = confirmedAmplifyEngagement(previous);
        rememberEngagementLastGood(lastGoodRef.current, key, row);
        return { ...current, [key]: row };
      });
      // Invalidate Hot session snapshots — leave/return soft-refetches rank
      // without scrolling the reader to the boosted card.
      recordViewerAmplifyConfirmed(post.accountId);
    },
    []
  );

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
