'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { trackCidFromPlayable } from '@/lib/collectibles-offline';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  albumTrackLovePathLike,
  dedupeAlbumFanIds,
  deriveLovedStateFromLedger,
  nextFanCountAfterLoveToggle,
  nextFanIdsAfterLoveToggle,
  recordTrackLove,
  scarceTrackContentPath,
  SCARCE_TRACK_LOVE_KIND,
  trackCidFromLovePostPath,
  type TrackLoveLedger,
} from '@/lib/scarce-track-love';
import { txToastError } from '@/lib/transaction-toast-copy';

interface LoveState {
  counts: Record<string, number>;
  viewerLoved: Set<string>;
  fanCount: number;
  fanIds: string[];
}

const EMPTY: LoveState = {
  counts: {},
  viewerLoved: new Set(),
  fanCount: 0,
  fanIds: [],
};

export function useScarceTrackLoves(opts: {
  creatorId?: string | null;
  collectionId?: string | null;
  tracks: ScarcePlayableMedia[];
}) {
  const creatorId = opts.creatorId?.trim() || '';
  const collectionId = opts.collectionId?.trim() || '';
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const [state, setState] = useState<LoveState>(EMPTY);
  const [fansLoading, setFansLoading] = useState(false);
  const [pendingCids, setPendingCids] = useState<Set<string>>(() => new Set());
  const stateRef = useRef(state);
  stateRef.current = state;
  const ledgerRef = useRef<TrackLoveLedger>(new Map());
  const retryTimersRef = useRef<number[]>([]);
  const loadIdRef = useRef(0);

  const trackKey = opts.tracks
    .map((track) => trackCidFromPlayable(track))
    .filter((cid): cid is string => Boolean(cid))
    .join('\n');

  const clearRetryTimers = useCallback(() => {
    for (const timer of retryTimersRef.current) window.clearTimeout(timer);
    retryTimersRef.current = [];
  }, []);

  const loadLoves = useCallback(async () => {
    const trackCids = trackKey ? trackKey.split('\n') : [];
    if (!creatorId || !collectionId || trackCids.length === 0) {
      setState(EMPTY);
      setFansLoading(false);
      return;
    }
    const loadId = ++loadIdRef.current;
    setFansLoading(true);
    const client = createReadOnlyOnSocialClient();
    const like = albumTrackLovePathLike(collectionId);
    try {
      // Love counts / viewer / fanCount stay independent of the roster query so a
      // facepile GraphQL miss cannot wipe hearts (Promise.all used to).
      const [countRows, viewerRows, fanRows] = await Promise.all([
        client.query.graphql<{
          reactionCounts: Array<{ postPath: string; reactionCount: number }>;
        }>({
          query: `query ScarceTrackLoveCounts($owner: String!, $paths: [String!], $kind: String!) {
            reactionCounts(where: {
              postOwner: {_eq: $owner},
              postPath: {_in: $paths},
              reactionKind: {_eq: $kind}
            }) {
              postPath reactionCount
            }
          }`,
          variables: {
            owner: creatorId,
            paths: trackCids.map((cid) =>
              scarceTrackContentPath(collectionId, cid)
            ),
            kind: SCARCE_TRACK_LOVE_KIND,
          },
        }),
        accountId
          ? client.query.graphql<{
              reactionsCurrent: Array<{ path: string }>;
            }>({
              query: `query ViewerScarceTrackLoves($viewer: String!, $owner: String!, $like: String!, $kind: String!) {
                reactionsCurrent(where: {
                  accountId: {_eq: $viewer},
                  postOwner: {_eq: $owner},
                  reactionKind: {_eq: $kind},
                  operation: {_eq: "set"},
                  path: {_like: $like}
                }) { path }
              }`,
              variables: {
                viewer: accountId,
                owner: creatorId,
                like,
                kind: SCARCE_TRACK_LOVE_KIND,
              },
            })
          : Promise.resolve(null),
        client.query.graphql<{
          scarceAlbumLoveFans: Array<{ fanCount: number | string }>;
        }>({
          query: `query ScarceAlbumFanCount($owner: String!, $collectionId: String!) {
            scarceAlbumLoveFans(where: {
              postOwner: {_eq: $owner},
              collectionId: {_eq: $collectionId}
            }) {
              fanCount
            }
          }`,
          variables: {
            owner: creatorId,
            collectionId,
          },
        }),
      ]);
      if (loadId !== loadIdRef.current) return;
      const apiCounts: Record<string, number> = {};
      for (const cid of trackCids) apiCounts[cid] = 0;
      for (const row of countRows.data?.reactionCounts ?? []) {
        const cid = trackCidFromLovePostPath(collectionId, row.postPath);
        if (cid) apiCounts[cid] = Number(row.reactionCount) || 0;
      }
      const apiLoved = new Set<string>();
      const marker = `/scarce/${collectionId}/track/`;
      for (const row of viewerRows?.data?.reactionsCurrent ?? []) {
        const at = row.path.lastIndexOf(marker);
        if (at < 0) continue;
        const cid = row.path.slice(at + marker.length);
        if (cid) apiLoved.add(cid);
      }
      const derived = deriveLovedStateFromLedger({
        trackCids,
        apiLoved,
        apiCounts,
        apiFanCount:
          Number(fanRows.data?.scarceAlbumLoveFans?.[0]?.fanCount ?? 0) || 0,
        ledger: ledgerRef.current,
        creatorId,
        viewerId: accountId,
      });

      const applyLedgerFanIds = (baseIds: string[]) => {
        let fanIds = baseIds;
        const rollingLoved = new Set(apiLoved);
        for (const [cid, loved] of ledgerRef.current) {
          if (loved === rollingLoved.has(cid)) continue;
          fanIds = nextFanIdsAfterLoveToggle({
            fanIds,
            creatorId,
            viewerId: accountId,
            viewerLovedCids: rollingLoved,
            targetCid: cid,
            nextLoved: loved,
          });
          if (loved) rollingLoved.add(cid);
          else rollingLoved.delete(cid);
        }
        return fanIds;
      };

      // Paint hearts + fan count immediately — don't block the player on roster.
      const needFanRoster =
        derived.fanCount > 0 ||
        derived.hasLedgerOverride ||
        stateRef.current.fanIds.length > 0;
      setState({
        counts: derived.counts,
        viewerLoved: derived.viewerLoved,
        fanCount: derived.fanCount,
        fanIds: needFanRoster
          ? applyLedgerFanIds(stateRef.current.fanIds)
          : [],
      });
      if (!derived.hasLedgerOverride) clearRetryTimers();
      // Facepile can resolve after loves; clear shimmer once ids exist or none needed.
      if (!needFanRoster || stateRef.current.fanIds.length > 0) {
        setFansLoading(false);
      }

      if (!needFanRoster) return;

      try {
        const fanAccountRows = await client.query.graphql<{
          reactionsCurrent: Array<{
            accountId: string;
            blockHeight: number | string;
          }>;
        }>({
          query: `query ScarceAlbumFanAccounts($owner: String!, $like: String!, $kind: String!) {
            reactionsCurrent(where: {
              postOwner: {_eq: $owner},
              reactionKind: {_eq: $kind},
              operation: {_eq: "set"},
              path: {_like: $like}
            }, orderBy: [{blockHeight: DESC}], limit: 80) {
              accountId
              blockHeight
            }
          }`,
          variables: {
            owner: creatorId,
            like,
            kind: SCARCE_TRACK_LOVE_KIND,
          },
        });
        if (loadId !== loadIdRef.current) return;
        const apiFanIds = dedupeAlbumFanIds(
          fanAccountRows.data?.reactionsCurrent ?? [],
          creatorId
        );
        setState((previous) => ({
          ...previous,
          fanIds: applyLedgerFanIds(apiFanIds),
        }));
      } catch {
        // Keep previous roster; loves already painted.
        if (loadId !== loadIdRef.current) return;
      }
    } catch {
      // Preserve optimistic / last-good love state — never wipe hearts on miss.
      if (loadId !== loadIdRef.current) return;
    } finally {
      if (loadId === loadIdRef.current) setFansLoading(false);
    }
  }, [accountId, clearRetryTimers, collectionId, creatorId, trackKey]);

  useEffect(() => {
    void loadLoves();
    return () => {
      loadIdRef.current += 1;
      clearRetryTimers();
    };
  }, [clearRetryTimers, loadLoves]);

  const toggleLove = useCallback(
    async (track: ScarcePlayableMedia) => {
      const cid = trackCidFromPlayable(track);
      if (!cid || !creatorId || !collectionId) return;
      if (!isConnected || !accountId) {
        await connect();
        return;
      }
      if (pendingCids.has(cid)) return;

      const previous = stateRef.current;
      const previousLedger = ledgerRef.current.has(cid)
        ? ledgerRef.current.get(cid)!
        : undefined;
      const nextLoved = !previous.viewerLoved.has(cid);
      const nextLovedCids = new Set(previous.viewerLoved);
      if (nextLoved) nextLovedCids.add(cid);
      else nextLovedCids.delete(cid);
      const nextCount = Math.max(
        0,
        (previous.counts[cid] ?? 0) + (nextLoved ? 1 : -1)
      );
      recordTrackLove(ledgerRef.current, cid, nextLoved);
      setPendingCids((current) => new Set(current).add(cid));
      setState({
        counts: { ...previous.counts, [cid]: nextCount },
        viewerLoved: nextLovedCids,
        fanCount: nextFanCountAfterLoveToggle({
          fanCount: previous.fanCount,
          creatorId,
          viewerId: accountId,
          viewerLovedCids: previous.viewerLoved,
          targetCid: cid,
          nextLoved,
        }),
        fanIds: nextFanIdsAfterLoveToggle({
          fanIds: previous.fanIds,
          creatorId,
          viewerId: accountId,
          viewerLovedCids: previous.viewerLoved,
          targetCid: cid,
          nextLoved,
        }),
      });

      try {
        const { client } = await getClient();
        const path = scarceTrackContentPath(collectionId, cid);
        if (nextLoved) {
          await client.social.react(
            creatorId,
            path,
            {
              type: SCARCE_TRACK_LOVE_KIND,
            },
            { wait: true }
          );
        } else {
          await client.social.unreact(
            creatorId,
            SCARCE_TRACK_LOVE_KIND,
            path,
            { wait: true }
          );
        }
        clearRetryTimers();
        retryTimersRef.current = INDEXER_SOFT_RETRY_MS.map((delay) =>
          window.setTimeout(() => {
            void loadLoves();
          }, delay)
        );
      } catch (cause) {
        if (previousLedger === undefined) ledgerRef.current.delete(cid);
        else recordTrackLove(ledgerRef.current, cid, previousLedger);
        setState(previous);
        if (!isWalletUserCancellation(cause)) {
          setTxResult({
            type: 'error',
            msg:
              cause instanceof Error
                ? cause.message
                : txToastError.loveTrackFailed,
          });
        }
      } finally {
        setPendingCids((current) => {
          const next = new Set(current);
          next.delete(cid);
          return next;
        });
      }
    },
    [
      accountId,
      clearRetryTimers,
      collectionId,
      connect,
      creatorId,
      getClient,
      isConnected,
      loadLoves,
      pendingCids,
      setTxResult,
    ]
  );

  return {
    fanCount: state.fanCount,
    fanIds: state.fanIds,
    fansLoading,
    loveCountFor: (track: ScarcePlayableMedia) => {
      const cid = trackCidFromPlayable(track);
      return cid ? (state.counts[cid] ?? 0) : 0;
    },
    viewerLoves: (track: ScarcePlayableMedia) => {
      const cid = trackCidFromPlayable(track);
      return Boolean(cid && state.viewerLoved.has(cid));
    },
    isLovePending: (track: ScarcePlayableMedia) => {
      const cid = trackCidFromPlayable(track);
      return Boolean(cid && pendingCids.has(cid));
    },
    toggleLove,
  };
}
