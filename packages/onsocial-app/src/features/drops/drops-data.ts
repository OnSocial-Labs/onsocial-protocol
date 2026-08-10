import type { OnSocial, ScarcesCollectionCurrentRow } from '@onsocial/sdk';
import {
  collectionCurrentRowToView,
  deriveCollectionStatus,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { fetchCollectionCreatorFaces } from '@/features/scarces/collection-creator-face';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { parseScarceCollectionSavePath } from '@/lib/scarce-save-content-path';

export type DropsSort =
  | 'live'
  | 'closing'
  | 'upcoming'
  | 'finished'
  | 'new'
  | 'loved'
  | 'saved';

export const DROPS_PAGE_SIZE = 24;

/** Closing tab / badge: end window within this horizon. */
export const DROPS_CLOSING_MS = 24 * 60 * 60 * 1000;
/** Closing badge when remaining supply is at or below this fraction. */
export const DROPS_CLOSING_REMAINING_RATIO = 0.1;

/** Extra rows pulled when medium is filtered client-side (Loved / Saved). */
const MEDIUM_OVERFETCH = 3;
const MEDIUM_FETCH_ROUNDS = 5;

export type DropDiscoveryItem = {
  collectionId: string;
  creatorId: string;
  title: string;
  mediaUrl: string | null;
  priceNear: string | null;
  mintedCount: number;
  remaining: number | null;
  totalSupply: number | null;
  startTimeMs: number | null;
  endTimeMs: number | null;
  status: CollectionStatus | null;
  /** Early-access allowlist present (matches collection page). */
  hasAllowlist: boolean;
  /** Normalized medium (`audio` / `video` / …) when known. */
  mediumKind: string | null;
  /** True when the drop has playable audio/video clips. */
  hasPlayable: boolean;
  /** Playable clip count when known (albums / multi-track audio). */
  trackCount: number | null;
  /** One-line blurb from collection description. */
  description: string | null;
  /** When the drop was created (ms). */
  createdAtMs: number | null;
  /** Soft-filled creator chrome. */
  creatorAvatarUrl?: string | null;
  creatorDisplayName?: string | null;
  /** Loved / batch fan count when known (> 0). */
  fanCount?: number;
  /** Top recent fan account ids for list facepile (≤ 5). */
  fanIds?: string[];
  view: CollectionView | null;
};

function rowMediumKind(row: ScarcesCollectionCurrentRow): string {
  return (
    row.mediumKind?.trim().toLowerCase() ||
    (row.kind?.trim().toLowerCase() === 'music'
      ? 'audio'
      : row.kind?.trim().toLowerCase()) ||
    ''
  );
}

function rowMatchesMedium(
  row: ScarcesCollectionCurrentRow,
  mediumKind: string | null
): boolean {
  if (!mediumKind) return true;
  return rowMediumKind(row) === mediumKind;
}

function rowToDiscoveryItem(
  row: ScarcesCollectionCurrentRow,
  extras?: { fanCount?: number }
): DropDiscoveryItem {
  let view: CollectionView | null = null;
  try {
    view = collectionCurrentRowToView(row);
  } catch {
    view = null;
  }
  const price =
    view?.priceNear ??
    (row.price && /^\d+$/.test(row.price) ? yoctoToNear(row.price) : null);
  return {
    collectionId: row.collectionId,
    creatorId: row.creatorId,
    title: view?.title?.trim() || row.title?.trim() || row.collectionId,
    mediaUrl: view?.mediaUrl ?? null,
    priceNear: price,
    mintedCount: row.mintedCount ?? 0,
    remaining: row.remaining ?? null,
    totalSupply: row.totalSupply ?? null,
    startTimeMs: view?.startTimeMs ?? null,
    endTimeMs: view?.endTimeMs ?? null,
    status: view ? deriveCollectionStatus(view) : null,
    hasAllowlist: view?.hasAllowlist ?? false,
    mediumKind: rowMediumKind(row) || view?.kind?.trim().toLowerCase() || null,
    hasPlayable: Boolean(view?.playables?.length),
    trackCount:
      view?.playables && view.playables.length > 0
        ? view.playables.length
        : null,
    description:
      view?.description?.trim() || row.description?.trim() || null,
    createdAtMs: view?.createdAtMs && view.createdAtMs > 0 ? view.createdAtMs : null,
    ...(extras?.fanCount != null ? { fanCount: extras.fanCount } : {}),
    view,
  };
}

/**
 * Soft-attach album fan counts + top fan ids (facepile).
 * Prefers `scarce_album_love_fan_ids`; falls back to counts-only view.
 */
async function withDropFanRosters(
  items: DropDiscoveryItem[],
  client: OnSocial
): Promise<DropDiscoveryItem[]> {
  if (items.length === 0) return items;
  const ids = [
    ...new Set(
      items.map((item) => item.collectionId.trim()).filter(Boolean)
    ),
  ];
  if (ids.length === 0) return items;

  try {
    const rows = await client.query.scarces.albumLoveFanIdsByCollectionIds(ids);
    if (rows.length > 0) {
      const byId = new Map<
        string,
        { fanCount: number; fanIds: string[] }
      >();
      for (const row of rows) {
        const id = row.collectionId?.trim();
        const count = Number(row.fanCount) || 0;
        if (!id || count <= 0) continue;
        const fanIds = (row.fanAccountIds ?? [])
          .map((fanId) => fanId.trim())
          .filter(Boolean)
          .slice(0, 5);
        const prev = byId.get(id);
        if (!prev || count > prev.fanCount) {
          byId.set(id, { fanCount: count, fanIds });
        }
      }
      if (byId.size === 0) return items;
      return items.map((item) => {
        const roster = byId.get(item.collectionId.trim());
        if (!roster) return item;
        return {
          ...item,
          fanCount: roster.fanCount,
          ...(roster.fanIds.length > 0 ? { fanIds: roster.fanIds } : {}),
        };
      });
    }
  } catch {
    // View may not be tracked yet — fall through to counts-only.
  }

  try {
    const rows = await client.query.scarces.albumLoveFansByCollectionIds(ids);
    if (rows.length === 0) return items;
    const byId = new Map<string, number>();
    for (const row of rows) {
      const id = row.collectionId?.trim();
      const count = Number(row.fanCount) || 0;
      if (!id || count <= 0) continue;
      const prev = byId.get(id) ?? 0;
      if (count > prev) byId.set(id, count);
    }
    if (byId.size === 0) return items;
    return items.map((item) => {
      const fanCount = byId.get(item.collectionId.trim());
      return fanCount != null ? { ...item, fanCount } : item;
    });
  } catch {
    return items;
  }
}

/** Soft-attach creator avatar + display name for the page of drops. */
async function withDropCreatorFaces(
  items: DropDiscoveryItem[],
  client: OnSocial
): Promise<DropDiscoveryItem[]> {
  if (items.length === 0) return items;
  const creatorIds = [
    ...new Set(items.map((item) => item.creatorId.trim()).filter(Boolean)),
  ];
  if (creatorIds.length === 0) return items;
  try {
    const faces = await fetchCollectionCreatorFaces(client, creatorIds);
    return items.map((item) => {
      const face = faces.get(item.creatorId.trim());
      if (!face) return item;
      return {
        ...item,
        creatorAvatarUrl: face.avatarUrl,
        creatorDisplayName: face.displayName,
      };
    });
  } catch {
    return items;
  }
}

async function decorateDropItems(
  items: DropDiscoveryItem[],
  client: OnSocial
): Promise<DropDiscoveryItem[]> {
  const withFans = await withDropFanRosters(items, client);
  return withDropCreatorFaces(withFans, client);
}

function closingSortKey(item: DropDiscoveryItem): number {
  if (item.endTimeMs != null && item.endTimeMs > 0) return item.endTimeMs;
  const ratio =
    item.remaining != null &&
    item.totalSupply != null &&
    item.totalSupply > 0
      ? item.remaining / item.totalSupply
      : 1;
  return Number.MAX_SAFE_INTEGER - Math.floor((1 - ratio) * 1e12);
}

function nowNs(): string {
  return String(BigInt(Date.now()) * 1_000_000n);
}

function closingNs(fromNowNs: string): string {
  return String(BigInt(fromNowNs) + BigInt(DROPS_CLOSING_MS) * 1_000_000n);
}

/** True when a live drop is ending soon or nearly sold through. */
export function isDropClosing(
  item: Pick<
    DropDiscoveryItem,
    'endTimeMs' | 'remaining' | 'totalSupply' | 'status'
  >,
  nowMs = Date.now()
): boolean {
  if (
    item.status === 'upcoming' ||
    item.status === 'ended' ||
    item.status === 'sold_out' ||
    item.status === 'cancelled' ||
    item.status === 'paused'
  ) {
    return false;
  }
  if (item.endTimeMs != null && item.endTimeMs > nowMs) {
    if (item.endTimeMs - nowMs <= DROPS_CLOSING_MS) return true;
  }
  if (
    item.remaining != null &&
    item.totalSupply != null &&
    item.totalSupply > 0 &&
    item.remaining > 0
  ) {
    return item.remaining / item.totalSupply <= DROPS_CLOSING_REMAINING_RATIO;
  }
  return false;
}

/**
 * Closing = time window (Hasura) ∪ scarce remaining ratio (client overfetch).
 * Paginate after merge so the tab matches `isDropClosing`.
 */
async function fetchClosingPage(
  client: OnSocial,
  opts: {
    mediumKind: string | null;
    limit: number;
    offset: number;
  }
): Promise<{ items: DropDiscoveryItem[]; hasMore: boolean }> {
  const ns = nowNs();
  const mediumFilter = opts.mediumKind
    ? { mediumKind: opts.mediumKind }
    : {};
  const batch = Math.max(opts.limit * MEDIUM_OVERFETCH, 40);
  const byId = new Map<string, DropDiscoveryItem>();

  const timed = await client.query.scarces.collectionsCurrent({
    limit: Math.max(opts.offset + opts.limit, batch),
    offset: 0,
    lifecycle: 'closing',
    nowNs: ns,
    closingNs: closingNs(ns),
    ...mediumFilter,
  });
  for (const row of timed) {
    const item = rowToDiscoveryItem(row);
    byId.set(item.collectionId.trim(), item);
  }

  let liveOffset = 0;
  let liveExhausted = false;
  for (let round = 0; round < MEDIUM_FETCH_ROUNDS; round += 1) {
    const rows = await client.query.scarces.collectionsCurrent({
      limit: batch,
      offset: liveOffset,
      lifecycle: 'live',
      nowNs: ns,
      ...mediumFilter,
    });
    liveOffset += rows.length;
    if (rows.length < batch) liveExhausted = true;
    for (const row of rows) {
      const item = rowToDiscoveryItem(row);
      if (!isDropClosing(item)) continue;
      byId.set(item.collectionId.trim(), item);
    }
    if (liveExhausted) break;
  }

  const merged = [...byId.values()].sort(
    (a, b) => closingSortKey(a) - closingSortKey(b)
  );
  const items = merged.slice(opts.offset, opts.offset + opts.limit);
  const hasMore =
    merged.length > opts.offset + opts.limit || !liveExhausted;
  return { items, hasMore };
}

/** Pick a single Live spotlight (closing first, else most minted). */
export function pickFeaturedLiveDrop(
  items: DropDiscoveryItem[]
): DropDiscoveryItem | null {
  if (items.length === 0) return null;
  const closing = items.find((item) => isDropClosing(item));
  if (closing) return closing;
  let best: DropDiscoveryItem | null = null;
  for (const item of items) {
    if (item.mintedCount <= 0) continue;
    if (!best || item.mintedCount > best.mintedCount) best = item;
  }
  return best;
}

export type UpcomingBucket = 'today' | 'week' | 'later';

export function upcomingBucket(
  startTimeMs: number | null,
  nowMs = Date.now()
): UpcomingBucket {
  if (startTimeMs == null || startTimeMs <= nowMs) return 'later';
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const endOfToday = start.getTime() + 24 * 60 * 60 * 1000;
  if (startTimeMs < endOfToday) return 'today';
  if (startTimeMs < nowMs + 7 * 24 * 60 * 60 * 1000) return 'week';
  return 'later';
}

async function fetchSavedPage(
  client: OnSocial,
  viewer: string,
  opts: {
    mediumKind: string | null;
    limit: number;
    offset: number;
  }
): Promise<{ items: DropDiscoveryItem[]; hasMore: boolean }> {
  const saves = await client.query.saves.list(viewer, {
    limit: 500,
    offset: 0,
  });
  const collectionIds = saves
    .map((row) => parseScarceCollectionSavePath(row.contentPath))
    .filter((id): id is string => Boolean(id));

  if (!opts.mediumKind) {
    const pageIds = collectionIds.slice(opts.offset, opts.offset + opts.limit);
    if (pageIds.length === 0) return { items: [], hasMore: false };
    const shells = await client.query.scarces.collectionsCurrentByIds(pageIds);
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    const items: DropDiscoveryItem[] = [];
    for (const id of pageIds) {
      const shell = byId.get(id);
      if (shell) items.push(rowToDiscoveryItem(shell));
    }
    return {
      items,
      hasMore: opts.offset + opts.limit < collectionIds.length,
    };
  }

  // Medium filter: walk saves in chunks until we fill the page window.
  const matched: DropDiscoveryItem[] = [];
  let cursor = 0;
  const chunk = Math.max(opts.limit * MEDIUM_OVERFETCH, 40);
  while (cursor < collectionIds.length && matched.length < opts.offset + opts.limit) {
    const slice = collectionIds.slice(cursor, cursor + chunk);
    cursor += slice.length;
    if (slice.length === 0) break;
    const shells = await client.query.scarces.collectionsCurrentByIds(slice);
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    for (const id of slice) {
      const shell = byId.get(id);
      if (!shell || !rowMatchesMedium(shell, opts.mediumKind)) continue;
      matched.push(rowToDiscoveryItem(shell));
      if (matched.length >= opts.offset + opts.limit) break;
    }
  }
  const items = matched.slice(opts.offset, opts.offset + opts.limit);
  const hasMore =
    matched.length > opts.offset + opts.limit || cursor < collectionIds.length;
  return { items, hasMore };
}

async function fetchLovedPage(
  client: OnSocial,
  opts: {
    mediumKind: string | null;
    limit: number;
    offset: number;
  }
): Promise<{ items: DropDiscoveryItem[]; hasMore: boolean }> {
  if (!opts.mediumKind) {
    const loves = await client.query.scarces.albumLoveFans({
      limit: opts.limit,
      offset: opts.offset,
    });
    const ids = loves.map((row) => row.collectionId).filter(Boolean);
    const shells =
      ids.length > 0
        ? await client.query.scarces.collectionsCurrentByIds(ids)
        : [];
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    const items: DropDiscoveryItem[] = [];
    for (const love of loves) {
      const shell = byId.get(love.collectionId.trim());
      if (!shell) continue;
      items.push(rowToDiscoveryItem(shell, { fanCount: love.fanCount }));
    }
    return { items, hasMore: loves.length === opts.limit };
  }

  const matched: DropDiscoveryItem[] = [];
  let loveOffset = 0;
  let exhausted = false;
  const batch = Math.max(opts.limit * MEDIUM_OVERFETCH, 40);
  for (let round = 0; round < MEDIUM_FETCH_ROUNDS; round += 1) {
    if (matched.length >= opts.offset + opts.limit) break;
    const loves = await client.query.scarces.albumLoveFans({
      limit: batch,
      offset: loveOffset,
    });
    loveOffset += loves.length;
    if (loves.length < batch) exhausted = true;
    if (loves.length === 0) break;
    const ids = loves.map((row) => row.collectionId).filter(Boolean);
    const shells =
      ids.length > 0
        ? await client.query.scarces.collectionsCurrentByIds(ids)
        : [];
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    for (const love of loves) {
      const shell = byId.get(love.collectionId.trim());
      if (!shell || !rowMatchesMedium(shell, opts.mediumKind)) continue;
      matched.push(rowToDiscoveryItem(shell, { fanCount: love.fanCount }));
      if (matched.length >= opts.offset + opts.limit) break;
    }
    if (exhausted) break;
  }
  const items = matched.slice(opts.offset, opts.offset + opts.limit);
  const hasMore =
    matched.length > opts.offset + opts.limit || !exhausted;
  return { items, hasMore };
}

export async function fetchDropsPage(
  opts: {
    sort?: DropsSort;
    mediumKind?: string | null;
    limit?: number;
    offset?: number;
    client?: OnSocial;
    /** Required when sort is `saved` — private bookmarks for this account. */
    viewerAccountId?: string | null;
  } = {}
): Promise<{ items: DropDiscoveryItem[]; hasMore: boolean }> {
  const sort = opts.sort ?? 'live';
  const mediumKind = opts.mediumKind?.trim().toLowerCase() || null;
  const limit = opts.limit ?? DROPS_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const client = opts.client ?? createReadOnlyOnSocialClient();
  const mediumFilter =
    mediumKind && mediumKind !== 'all'
      ? { mediumKind: mediumKind === 'music' ? 'audio' : mediumKind }
      : {};
  const effectiveMedium = mediumFilter.mediumKind ?? null;

  if (sort === 'saved') {
    const viewer = opts.viewerAccountId?.trim() ?? '';
    if (!viewer) return { items: [], hasMore: false };
    const page = await fetchSavedPage(client, viewer, {
      mediumKind: effectiveMedium,
      limit,
      offset,
    });
    return {
      items: await decorateDropItems(page.items, client),
      hasMore: page.hasMore,
    };
  }

  if (sort === 'loved') {
    const page = await fetchLovedPage(client, {
      mediumKind: effectiveMedium,
      limit,
      offset,
    });
    return {
      items: await withDropCreatorFaces(page.items, client),
      hasMore: page.hasMore,
    };
  }

  if (sort === 'closing') {
    const page = await fetchClosingPage(client, {
      mediumKind: effectiveMedium,
      limit,
      offset,
    });
    return {
      items: await decorateDropItems(page.items, client),
      hasMore: page.hasMore,
    };
  }

  if (sort === 'live' || sort === 'upcoming' || sort === 'finished') {
    const ns = nowNs();
    const rows = await client.query.scarces.collectionsCurrent({
      limit,
      offset,
      lifecycle: sort,
      nowNs: ns,
      ...mediumFilter,
    });
    const items = await decorateDropItems(
      rows.map((row) => rowToDiscoveryItem(row)),
      client
    );
    return {
      items,
      hasMore: rows.length === limit,
    };
  }

  const rows = await client.query.scarces.collectionsCurrent({
    limit,
    offset,
    orderBy: 'new',
    ...mediumFilter,
  });
  return {
    items: await decorateDropItems(
      rows.map((row) => rowToDiscoveryItem(row)),
      client
    ),
    hasMore: rows.length === limit,
  };
}

export type CreatorLeaderRow = {
  accountId: string;
  itemsCreated: number;
  itemsSold: number;
  collectionsCreated: number;
  revenueNear: string | null;
};

export async function fetchCreatorLeaders(
  opts: { limit?: number; client?: OnSocial } = {}
): Promise<CreatorLeaderRow[]> {
  const client = opts.client ?? createReadOnlyOnSocialClient();
  const rows = await client.query.scarces.activityLeaderboard({
    limit: opts.limit ?? 12,
    orderBy: 'revenue',
  });
  return rows
    .filter((row) => row.accountId?.trim())
    .map((row) => ({
      accountId: row.accountId.trim(),
      itemsCreated: row.itemsCreated ?? 0,
      itemsSold: row.itemsSold ?? 0,
      collectionsCreated: row.collectionsCreated ?? 0,
      revenueNear:
        row.revenueEarned && /^\d+$/.test(row.revenueEarned)
          ? yoctoToNear(row.revenueEarned)
          : null,
    }));
}
