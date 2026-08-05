import { accountIdsEqual } from '@/lib/account-match';

export const SCARCE_TRACK_LOVE_KIND = 'love';

export function scarceTrackContentPath(
  collectionId: string,
  cid: string
): string {
  return `scarce/${collectionId}/track/${cid}`;
}

export function albumTrackLovePathLike(collectionId: string): string {
  return `%/scarce/${collectionId}/track/%`;
}

export function trackCidFromLovePostPath(
  collectionId: string,
  postPath: string
): string | null {
  const prefix = `${scarceTrackContentPath(collectionId, '')}`;
  if (!postPath.startsWith(prefix)) return null;
  const cid = postPath.slice(prefix.length).trim();
  return cid || null;
}

export function countAlbumFans(
  accountIds: readonly string[],
  creatorId: string
): number {
  const unique = new Set<string>();
  for (const accountId of accountIds) {
    const id = accountId.trim();
    if (!id || accountIdsEqual(id, creatorId)) continue;
    unique.add(id.toLowerCase());
  }
  return unique.size;
}

export type TrackLoveLedger = Map<string, boolean>;

export function recordTrackLove(
  ledger: TrackLoveLedger,
  cid: string,
  loved: boolean
): void {
  ledger.set(cid, loved);
}

export function resolveTrackLove(
  ledger: TrackLoveLedger,
  cid: string,
  apiLoved: boolean
): boolean {
  const entry = ledger.get(cid);
  return entry === undefined ? apiLoved : entry;
}

export function reconcileTrackLove(
  ledger: TrackLoveLedger,
  cid: string,
  apiLoved: boolean
): boolean {
  const entry = ledger.get(cid);
  if (entry === undefined || entry !== apiLoved) return false;
  return ledger.delete(cid);
}

export function deriveLovedStateFromLedger(opts: {
  trackCids: readonly string[];
  apiLoved: ReadonlySet<string>;
  apiCounts: Record<string, number>;
  apiFanCount: number;
  ledger: TrackLoveLedger;
  creatorId: string;
  viewerId: string | null;
}): {
  viewerLoved: Set<string>;
  counts: Record<string, number>;
  fanCount: number;
  hasLedgerOverride: boolean;
} {
  for (const cid of [...opts.ledger.keys()]) {
    reconcileTrackLove(opts.ledger, cid, opts.apiLoved.has(cid));
  }

  const viewerLoved = new Set<string>();
  const counts = { ...opts.apiCounts };
  for (const cid of opts.trackCids) {
    const apiLoved = opts.apiLoved.has(cid);
    const loved = resolveTrackLove(opts.ledger, cid, apiLoved);
    if (loved) viewerLoved.add(cid);
    if (loved !== apiLoved) {
      counts[cid] = Math.max(0, (counts[cid] ?? 0) + (loved ? 1 : -1));
    }
  }

  let fanCount = opts.apiFanCount;
  const rollingLoved = new Set(opts.apiLoved);
  for (const [cid, loved] of opts.ledger) {
    if (loved === rollingLoved.has(cid)) continue;
    fanCount = nextFanCountAfterLoveToggle({
      fanCount,
      creatorId: opts.creatorId,
      viewerId: opts.viewerId,
      viewerLovedCids: rollingLoved,
      targetCid: cid,
      nextLoved: loved,
    });
    if (loved) rollingLoved.add(cid);
    else rollingLoved.delete(cid);
  }

  return {
    viewerLoved,
    counts,
    fanCount,
    hasLedgerOverride: opts.ledger.size > 0,
  };
}

export function nextFanCountAfterLoveToggle(opts: {
  fanCount: number;
  creatorId: string;
  viewerId: string | null;
  viewerLovedCids: ReadonlySet<string>;
  targetCid: string;
  nextLoved: boolean;
}): number {
  if (!opts.viewerId || accountIdsEqual(opts.viewerId, opts.creatorId)) {
    return opts.fanCount;
  }
  const hadAny = opts.viewerLovedCids.size > 0;
  const nextSize = opts.nextLoved
    ? opts.viewerLovedCids.has(opts.targetCid)
      ? opts.viewerLovedCids.size
      : opts.viewerLovedCids.size + 1
    : opts.viewerLovedCids.has(opts.targetCid)
      ? opts.viewerLovedCids.size - 1
      : opts.viewerLovedCids.size;
  const hasAny = nextSize > 0;
  if (!hadAny && hasAny) return opts.fanCount + 1;
  if (hadAny && !hasAny) return Math.max(0, opts.fanCount - 1);
  return opts.fanCount;
}
