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
  deriveLovedStateFromLedger,
  nextFanCountAfterLoveToggle,
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
}

const EMPTY: LoveState = {
  counts: {},
  viewerLoved: new Set(),
  fanCount: 0,
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
      return;
    }
    const loadId = ++loadIdRef.current;
    const client = createReadOnlyOnSocialClient();
    try {
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
                like: albumTrackLovePathLike(collectionId),
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
      setState({
        counts: derived.counts,
        viewerLoved: derived.viewerLoved,
        fanCount: derived.fanCount,
      });
      if (!derived.hasLedgerOverride) clearRetryTimers();
    } catch {
      if (loadId !== loadIdRef.current) return;
      if (ledgerRef.current.size === 0) setState(EMPTY);
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
      });

      try {
        const { client } = await getClient();
        const path = scarceTrackContentPath(collectionId, cid);
        if (nextLoved) {
          await client.social.react(creatorId, path, {
            type: SCARCE_TRACK_LOVE_KIND,
          });
        } else {
          await client.social.unreact(
            creatorId,
            SCARCE_TRACK_LOVE_KIND,
            path
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
