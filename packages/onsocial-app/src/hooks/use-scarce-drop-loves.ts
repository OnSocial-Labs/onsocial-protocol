'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import {
  dedupeDropFanIds,
  dropFanCount,
  dropFanCountMatchingRoster,
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

/** Last-good love face — reopen / wallet hydrate must not flash empty→filled. */
const DROP_LOVE_CACHE_MAX = 48;
const dropLoveCache = new Map<string, DropLoveState>();

function rememberDropLoveEntry(key: string, state: DropLoveState): void {
  dropLoveCache.delete(key);
  dropLoveCache.set(key, state);
  while (dropLoveCache.size > DROP_LOVE_CACHE_MAX) {
    const oldest = dropLoveCache.keys().next().value;
    if (oldest == null) break;
    dropLoveCache.delete(oldest);
  }
}

function peekStoredWalletAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function dropLoveViewerId(accountId: string | null | undefined): string {
  return accountId?.trim() || peekStoredWalletAccountId()?.trim() || '';
}

function dropLoveCacheKey(
  viewerId: string,
  creatorId: string,
  collectionId: string
): string {
  return `${viewerId.toLowerCase()}\0${creatorId}\0${collectionId}`;
}

/** Fan face without a viewer — list seed / signed-out open. */
function dropLoveFaceCacheKey(creatorId: string, collectionId: string): string {
  return `\0${creatorId}\0${collectionId}`;
}

function peekDropLoveState(
  viewerId: string,
  creatorId: string,
  collectionId: string
): DropLoveState | null {
  if (!creatorId || !collectionId) return null;
  if (viewerId) {
    const forViewer = dropLoveCache.get(
      dropLoveCacheKey(viewerId, creatorId, collectionId)
    );
    if (forViewer) return forViewer;
  }
  return (
    dropLoveCache.get(dropLoveFaceCacheKey(creatorId, collectionId)) ?? null
  );
}

function rememberDropLoveState(
  viewerId: string,
  creatorId: string,
  collectionId: string,
  state: DropLoveState
): void {
  if (!creatorId || !collectionId) return;
  rememberDropLoveEntry(dropLoveFaceCacheKey(creatorId, collectionId), state);
  if (viewerId) {
    rememberDropLoveEntry(
      dropLoveCacheKey(viewerId, creatorId, collectionId),
      state
    );
  }
}

/**
 * Drops / market already painted a fan count — seed so the face does not
 * empty→pending→filled on open.
 */
export function seedDropLoveFaceFromList(opts: {
  creatorId?: string | null;
  collectionId?: string | null;
  fanCount: number;
  fanIds?: string[] | null;
  viewerId?: string | null;
}): void {
  const creatorId = opts.creatorId?.trim() || '';
  const collectionId = opts.collectionId?.trim() || '';
  const fanCount = Math.max(0, Math.floor(opts.fanCount));
  if (!creatorId || !collectionId || fanCount <= 0) return;
  const viewerId = dropLoveViewerId(opts.viewerId);
  const existing = peekDropLoveState(viewerId, creatorId, collectionId);
  if (
    existing &&
    (existing.fanIds.length > 0 || existing.fanCount >= fanCount)
  ) {
    return;
  }
  const fanIds = dedupeDropFanIds(
    (opts.fanIds ?? existing?.fanIds ?? []).map((accountId) => ({ accountId })),
    creatorId
  );
  rememberDropLoveState(viewerId, creatorId, collectionId, {
    loveCount: existing?.loveCount ?? 0,
    viewerLoved: existing?.viewerLoved ?? false,
    fanCount: Math.max(fanCount, existing?.fanCount ?? 0),
    fanIds,
  });
}

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
  const {
    accountId,
    isConnected,
    connect,
    isLoading: walletLoading,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult } = useAppTransactionFeedback();
  const active = Boolean(creatorId && collectionId);
  const dropKey = active ? `${creatorId}\0${collectionId}` : '';
  const [state, setState] = useState<DropLoveState>(() => {
    if (!active) return EMPTY;
    return (
      peekDropLoveState(
        dropLoveViewerId(accountId),
        creatorId,
        collectionId
      ) ?? EMPTY
    );
  });
  const [fansLoading, setFansLoading] = useState(() => {
    if (!active) return false;
    const cached = peekDropLoveState(
      dropLoveViewerId(accountId),
      creatorId,
      collectionId
    );
    // Unknown zero stays chassis — do not flash a loading seat then empty.
    return Boolean(cached && cached.fanCount > 0 && cached.fanIds.length === 0);
  });
  const [pending, setPending] = useState(false);
  const [boundKey, setBoundKey] = useState(dropKey);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ledgerRef = useRef<DropLoveLedger>(null);
  const apiLovedRef = useRef(false);
  const retryTimersRef = useRef<number[]>([]);
  const loadIdRef = useRef(0);
  /** After first settle, soft reloads must not reopen the fans pending seat. */
  const fansSettledRef = useRef(
    Boolean(
      active &&
        peekDropLoveState(
          dropLoveViewerId(accountId),
          creatorId,
          collectionId
        )
    )
  );

  if (boundKey !== dropKey) {
    setBoundKey(dropKey);
    const cached = active
      ? peekDropLoveState(
          dropLoveViewerId(accountId),
          creatorId,
          collectionId
        )
      : null;
    setState(cached ?? EMPTY);
    fansSettledRef.current = Boolean(cached);
    setFansLoading(
      Boolean(cached && cached.fanCount > 0 && cached.fanIds.length === 0)
    );
    ledgerRef.current = null;
    apiLovedRef.current = cached?.viewerLoved ?? false;
  }

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
    // First roster only — never reopen pending after a settled face (incl. zero).
    if (
      !fansSettledRef.current &&
      stateRef.current.fanCount > 0 &&
      stateRef.current.fanIds.length === 0
    ) {
      setFansLoading(true);
    }
    const client = createReadOnlyOnSocialClient();
    const path = scarceDropContentPath(collectionId);
    const like = scarceDropLovePathLike(collectionId);
    // Wallet still hydrating — never treat missing account as "unloved".
    const viewerLovePending = !accountId && walletLoading;
    try {
      const [countResult, viewerResult, fanCountResult] = await Promise.allSettled([
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
        client.query.graphql<{
          scarceDropLoveFans: Array<{ fanCount: number | string }>;
        }>({
          query: `query ScarceDropFanCount($owner: String!, $collectionId: String!) {
            scarceDropLoveFans(where: {
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
      if (countResult.status !== 'fulfilled') {
        throw countResult.reason;
      }
      if (loadId !== loadIdRef.current) return;
      const countRows = countResult.value;
      const viewerRows =
        viewerResult.status === 'fulfilled' ? viewerResult.value : null;
      const fanRows =
        fanCountResult.status === 'fulfilled' ? fanCountResult.value : null;

      const apiCount =
        Number(countRows.data?.reactionCounts?.[0]?.reactionCount ?? 0) || 0;
      let apiLoved = false;
      if (accountId) {
        for (const row of viewerRows?.data?.reactionsCurrent ?? []) {
          if (pathIsDropLove(collectionId, row.path)) {
            apiLoved = true;
            break;
          }
        }
      } else if (viewerLovePending) {
        apiLoved = stateRef.current.viewerLoved;
      }

      apiLovedRef.current = apiLoved;
      const ledger = ledgerRef.current;
      if (ledger != null && ledger.loved === apiLoved) {
        ledgerRef.current = null;
      }
      const loved = resolveLoved(apiLoved);
      const loveCount =
        loved === apiLoved ? apiCount : Math.max(0, apiCount + (loved ? 1 : -1));
      const indexedFanCount =
        fanRows == null
          ? null
          : Number(fanRows.data?.scarceDropLoveFans?.[0]?.fanCount ?? 0) || 0;
      const fanCount = nextDropFanCountAfterToggle({
        fanCount: dropFanCount({
          indexedFanCount,
          reactionCount: apiCount,
          creatorLoved:
            accountId != null &&
            accountIdsEqual(accountId, creatorId) &&
            loved,
        }),
        creatorId,
        viewerId: accountId,
        apiLoved,
        nextLoved: loved,
      });

      const needFanRoster =
        fanCount > 0 ||
        ledgerRef.current != null ||
        stateRef.current.fanIds.length > 0;
      const nextState: DropLoveState = {
        loveCount,
        viewerLoved: loved,
        fanCount,
        fanIds: needFanRoster ? stateRef.current.fanIds : [],
      };
      setState(nextState);
      rememberDropLoveState(
        dropLoveViewerId(accountId),
        creatorId,
        collectionId,
        nextState
      );
      if (ledgerRef.current == null) clearRetryTimers();
      fansSettledRef.current = true;
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
        setState((previous) => {
          const next: DropLoveState = {
            ...previous,
            fanIds,
            fanCount: dropFanCountMatchingRoster({
              fanCount,
              fanIds,
            }),
          };
          rememberDropLoveState(
            dropLoveViewerId(accountId),
            creatorId,
            collectionId,
            next
          );
          return next;
        });
      } catch {
        if (loadId !== loadIdRef.current) return;
      } finally {
        if (loadId === loadIdRef.current) {
          fansSettledRef.current = true;
          setFansLoading(false);
        }
      }
    } catch {
      if (loadId !== loadIdRef.current) return;
      fansSettledRef.current = true;
      setFansLoading(false);
    }
  }, [
    accountId,
    clearRetryTimers,
    collectionId,
    creatorId,
    resolveLoved,
    walletLoading,
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
    setState((previous) => {
      const next: DropLoveState = {
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
      };
      rememberDropLoveState(accountId, creatorId, collectionId, next);
      return next;
    });

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
          msg: error instanceof Error ? error.message : txToastError.loveDropFailed,
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
