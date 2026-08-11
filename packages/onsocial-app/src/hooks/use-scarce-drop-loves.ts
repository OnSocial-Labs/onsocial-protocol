'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import {
  dedupeDropFanIds,
  nextDropFanCountAfterToggle,
  nextDropFanIdsAfterToggle,
  scarceDropContentPath,
  scarceDropLovePathLike,
  SCARCE_DROP_LOVE_KIND,
  type DropLoveLedger,
} from '@/lib/scarce-drop-love';
import { txToastError } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface DropLoveState {
  loveCount: number;
  viewerLoved: boolean;
  fanCount: number;
  fanIds: string[];
}

const EMPTY: DropLoveState = {
  loveCount: 0,
  viewerLoved: false,
  fanCount: 0,
  fanIds: [],
};

/** True when reaction path is drop-level love (not a track under the same id). */
function pathIsDropLove(collectionId: string, path: string): boolean {
  const marker = `/scarce/${collectionId}`;
  const at = path.lastIndexOf(marker);
  if (at < 0) return false;
  const after = path.slice(at + marker.length);
  return after === '' || after === '/';
}

/**
 * Drop-level love (collection as a whole). Album track loves stay separate.
 */
export function useScarceDropLoves(opts: {
  creatorId?: string | null;
  collectionId?: string | null;
}) {
  const creatorId = opts.creatorId?.trim() || '';
  const collectionId = opts.collectionId?.trim() || '';
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const [state, setState] = useState<DropLoveState>(EMPTY);
  const [fansLoading, setFansLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ledgerRef = useRef<DropLoveLedger>(null);
  const apiLovedRef = useRef(false);
  const retryTimersRef = useRef<number[]>([]);
  const loadIdRef = useRef(0);

  const clearRetryTimers = useCallback(() => {
    for (const timer of retryTimersRef.current) window.clearTimeout(timer);
    retryTimersRef.current = [];
  }, []);

  const resolveLoved = useCallback((apiLoved: boolean) => {
    const ledger = ledgerRef.current;
    return ledger == null ? apiLoved : ledger.loved;
  }, []);

  const loadLoves = useCallback(async () => {
    if (!creatorId || !collectionId) {
      setState(EMPTY);
      setFansLoading(false);
      return;
    }
    const loadId = ++loadIdRef.current;
    setFansLoading(true);
    const client = createReadOnlyOnSocialClient();
    const path = scarceDropContentPath(collectionId);
    const like = scarceDropLovePathLike(collectionId);
    try {
      const [countRows, viewerRows] = await Promise.all([
        client.query.graphql<{
          reactionCounts: Array<{ postPath: string; reactionCount: number }>;
        }>({
          query: `query ScarceDropLoveCount($owner: String!, $paths: [String!], $kind: String!) {
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
            paths: [path],
            kind: SCARCE_DROP_LOVE_KIND,
          },
        }),
        accountId
          ? client.query.graphql<{
              reactionsCurrent: Array<{ path: string }>;
            }>({
              query: `query ViewerScarceDropLove($viewer: String!, $owner: String!, $like: String!, $kind: String!) {
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
                kind: SCARCE_DROP_LOVE_KIND,
              },
            })
          : Promise.resolve(null),
      ]);
      if (loadId !== loadIdRef.current) return;

      const apiCount =
        Number(countRows.data?.reactionCounts?.[0]?.reactionCount ?? 0) || 0;
      let apiLoved = false;
      for (const row of viewerRows?.data?.reactionsCurrent ?? []) {
        if (pathIsDropLove(collectionId, row.path)) {
          apiLoved = true;
          break;
        }
      }

      apiLovedRef.current = apiLoved;
      const ledger = ledgerRef.current;
      if (ledger != null && ledger.loved === apiLoved) {
        ledgerRef.current = null;
      }
      const loved = resolveLoved(apiLoved);
      const loveCount =
        loved === apiLoved ? apiCount : Math.max(0, apiCount + (loved ? 1 : -1));
      const fanCount = nextDropFanCountAfterToggle({
        fanCount: apiCount,
        creatorId,
        viewerId: accountId,
        apiLoved,
        nextLoved: loved,
      });

      const needFanRoster =
        fanCount > 0 ||
        ledgerRef.current != null ||
        stateRef.current.fanIds.length > 0;
      setState({
        loveCount,
        viewerLoved: loved,
        fanCount,
        fanIds: needFanRoster ? stateRef.current.fanIds : [],
      });
      if (ledgerRef.current == null) clearRetryTimers();
      if (!needFanRoster || stateRef.current.fanIds.length > 0) {
        setFansLoading(false);
      }

      if (!needFanRoster) return;

      try {
        const fanAccountRows = await client.query.graphql<{
          reactionsCurrent: Array<{
            accountId: string;
            path: string;
          }>;
        }>({
          query: `query ScarceDropFanAccounts($owner: String!, $like: String!, $kind: String!) {
            reactionsCurrent(where: {
              postOwner: {_eq: $owner},
              reactionKind: {_eq: $kind},
              operation: {_eq: "set"},
              path: {_like: $like}
            }, orderBy: [{blockHeight: DESC}], limit: 80) {
              accountId
              path
            }
          }`,
          variables: {
            owner: creatorId,
            like,
            kind: SCARCE_DROP_LOVE_KIND,
          },
        });
        if (loadId !== loadIdRef.current) return;
        const dropFans = (fanAccountRows.data?.reactionsCurrent ?? []).filter(
          (row) => pathIsDropLove(collectionId, row.path)
        );
        const apiFanIds = dedupeDropFanIds(dropFans, creatorId);
        const fanIds = nextDropFanIdsAfterToggle({
          fanIds: apiFanIds,
          creatorId,
          viewerId: accountId,
          apiLoved,
          nextLoved: loved,
        });
        setState((previous) => ({ ...previous, fanIds }));
      } catch {
        if (loadId !== loadIdRef.current) return;
      } finally {
        if (loadId === loadIdRef.current) setFansLoading(false);
      }
    } catch {
      if (loadId !== loadIdRef.current) return;
      setFansLoading(false);
    }
  }, [
    accountId,
    clearRetryTimers,
    collectionId,
    creatorId,
    resolveLoved,
  ]);

  useEffect(() => {
    void loadLoves();
    return () => {
      loadIdRef.current += 1;
      clearRetryTimers();
    };
  }, [clearRetryTimers, loadLoves]);

  const toggleLove = useCallback(async () => {
    if (!creatorId || !collectionId) return;
    if (!isConnected || !accountId) {
      await connect();
      return;
    }
    if (pending) return;

    const path = scarceDropContentPath(collectionId);
    const currentlyLoved = resolveLoved(apiLovedRef.current);
    const nextLoved = !currentlyLoved;

    setPending(true);
    ledgerRef.current = { loved: nextLoved };
    setState((previous) => ({
      loveCount: Math.max(0, previous.loveCount + (nextLoved ? 1 : -1)),
      viewerLoved: nextLoved,
      fanCount: nextDropFanCountAfterToggle({
        fanCount: previous.fanCount,
        creatorId,
        viewerId: accountId,
        apiLoved: previous.viewerLoved,
        nextLoved,
      }),
      fanIds: nextDropFanIdsAfterToggle({
        fanIds: previous.fanIds,
        creatorId,
        viewerId: accountId,
        apiLoved: previous.viewerLoved,
        nextLoved,
      }),
    }));

    try {
      const { client } = await getClient();
      if (nextLoved) {
        await client.social.react(
          creatorId,
          path,
          { type: SCARCE_DROP_LOVE_KIND },
          { wait: true }
        );
      } else {
        await client.social.unreact(
          creatorId,
          SCARCE_DROP_LOVE_KIND,
          path,
          { wait: true }
        );
      }
      clearRetryTimers();
      for (const delay of INDEXER_SOFT_RETRY_MS) {
        const timer = window.setTimeout(() => {
          void loadLoves();
        }, delay);
        retryTimersRef.current.push(timer);
      }
      void loadLoves();
    } catch (error) {
      ledgerRef.current = { loved: currentlyLoved };
      setState((previous) => ({
        loveCount: Math.max(0, previous.loveCount + (nextLoved ? -1 : 1)),
        viewerLoved: currentlyLoved,
        fanCount: nextDropFanCountAfterToggle({
          fanCount: previous.fanCount,
          creatorId,
          viewerId: accountId,
          apiLoved: nextLoved,
          nextLoved: currentlyLoved,
        }),
        fanIds: nextDropFanIdsAfterToggle({
          fanIds: previous.fanIds,
          creatorId,
          viewerId: accountId,
          apiLoved: nextLoved,
          nextLoved: currentlyLoved,
        }),
      }));
      if (!isWalletUserCancellation(error)) {
        setTxResult({
          type: 'error',
          msg: error instanceof Error ? error.message : txToastError.generic,
        });
      }
    } finally {
      setPending(false);
    }
  }, [
    accountId,
    clearRetryTimers,
    collectionId,
    connect,
    creatorId,
    getClient,
    isConnected,
    loadLoves,
    pending,
    resolveLoved,
    setTxResult,
  ]);

  return {
    loveCount: state.loveCount,
    fanCount: state.fanCount,
    fanIds: state.fanIds,
    fansLoading,
    viewerLoved: state.viewerLoved,
    pending,
    toggleLove,
  };
}
