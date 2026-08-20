/**
 * In-memory DAO workspace prefetch — feed (proposals + policy/members) and
 * treasury. Filled after portfolio face paint; sheets hydrate instantly.
 */

import { fetchProtocolDaoTransferAssets } from '@/features/protocol/protocol-dao-context-client';
import { fetchProtocolFeed } from '@/features/protocol/protocol-feed-client';
import type { ProtocolFeedResponse } from '@/features/protocol/types';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** Fresh enough to paint sheets without a cold spinner. */
export const DAO_WORKSPACE_FEED_TTL_MS = 60_000;
export const DAO_WORKSPACE_TREASURY_TTL_MS = 45_000;

export type DaoWorkspaceTreasurySnapshot = {
  assets: ProtocolDaoTransferAsset[];
  supportYocto: string;
};

type Timed<T> = { at: number; value: T };

const feedCache = new Map<string, Timed<ProtocolFeedResponse>>();
const treasuryCache = new Map<string, Timed<DaoWorkspaceTreasurySnapshot>>();
const inflight = new Map<string, Promise<void>>();

function normalizeDaoId(daoAccountId: string): string | null {
  const id = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(id)) return null;
  return id;
}

function readTimed<T>(
  cache: Map<string, Timed<T>>,
  id: string,
  ttlMs: number
): T | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(id);
    return null;
  }
  return hit.value;
}

export function writeDaoFeedCache(
  daoAccountId: string,
  feed: ProtocolFeedResponse
): void {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return;
  feedCache.set(id, { at: Date.now(), value: feed });
}

export function readDaoFeedCache(
  daoAccountId: string
): ProtocolFeedResponse | null {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return null;
  return readTimed(feedCache, id, DAO_WORKSPACE_FEED_TTL_MS);
}

export function writeDaoTreasuryCache(
  daoAccountId: string,
  snapshot: DaoWorkspaceTreasurySnapshot
): void {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return;
  treasuryCache.set(id, { at: Date.now(), value: snapshot });
}

export function readDaoTreasuryCache(
  daoAccountId: string
): DaoWorkspaceTreasurySnapshot | null {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return null;
  return readTimed(treasuryCache, id, DAO_WORKSPACE_TREASURY_TTL_MS);
}

export function invalidateDaoWorkspaceCache(daoAccountId: string): void {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return;
  feedCache.delete(id);
  treasuryCache.delete(id);
  inflight.delete(id);
}

/** Test helper — drop all entries. */
export function clearDaoWorkspacePrefetchCaches(): void {
  feedCache.clear();
  treasuryCache.clear();
  inflight.clear();
}

/**
 * Fire-and-forget after portfolio face paint. Does not block open.
 * Dedupes concurrent calls per DAO.
 */
export function prefetchDaoWorkspace(daoAccountId: string): void {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return;
  if (inflight.has(id)) return;

  const feedFresh = readDaoFeedCache(id);
  const treasuryFresh = readDaoTreasuryCache(id);
  if (feedFresh && treasuryFresh) return;

  const run = (async () => {
    const tasks: Promise<void>[] = [];

    if (!feedFresh) {
      tasks.push(
        fetchProtocolFeed(id, 'protocol')
          .then((feed) => {
            writeDaoFeedCache(id, feed);
          })
          .catch(() => {
            // best-effort
          })
      );
    }

    if (!treasuryFresh) {
      tasks.push(
        Promise.all([
          fetchProtocolDaoTransferAssets(id),
          fetchProfileSupportBalanceYocto(id, { fresh: true }).catch(() => 0n),
        ])
          .then(([assets, supportYocto]) => {
            writeDaoTreasuryCache(id, {
              assets,
              supportYocto: supportYocto.toString(),
            });
          })
          .catch(() => {
            // best-effort
          })
      );
    }

    await Promise.all(tasks);
  })().finally(() => {
    inflight.delete(id);
  });

  inflight.set(id, run);
}

/** Schedule prefetch after paint / idle — never blocks first paint. */
export function scheduleDaoWorkspacePrefetch(daoAccountId: string): () => void {
  const id = normalizeDaoId(daoAccountId);
  if (!id) return () => {};

  let cancelled = false;
  const kick = () => {
    if (!cancelled) prefetchDaoWorkspace(id);
  };

  if (typeof window === 'undefined') {
    kick();
    return () => {
      cancelled = true;
    };
  }

  const win = window;
  let idleId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (typeof win.requestIdleCallback === 'function') {
    idleId = win.requestIdleCallback(kick, { timeout: 1200 });
  } else {
    timeoutId = setTimeout(kick, 0);
  }

  return () => {
    cancelled = true;
    if (idleId != null) win.cancelIdleCallback?.(idleId);
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}

/**
 * After a successful DAO mutation (propose / vote / claim / boost / config):
 * drop stale snapshots so the next sheet open cannot flash pre-tx data, then
 * soft-refill in the background for the next open.
 */
export function bumpDaoWorkspacePrefetch(daoAccountId: string): () => void {
  invalidateDaoWorkspaceCache(daoAccountId);
  return scheduleDaoWorkspacePrefetch(daoAccountId);
}
