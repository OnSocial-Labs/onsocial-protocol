import type { OnSocial, ScarcesCollectionCurrentRow } from '@onsocial/sdk';
import {
  collectionCurrentRowToView,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { parseScarceCollectionSavePath } from '@/lib/scarce-save-content-path';

export type DropsSort = 'new' | 'minting' | 'loved' | 'volume' | 'saved';

export const DROPS_PAGE_SIZE = 24;

export type DropDiscoveryItem = {
  collectionId: string;
  creatorId: string;
  title: string;
  mediaUrl: string | null;
  priceNear: string | null;
  mintedCount: number;
  remaining: number | null;
  totalSupply: number | null;
  /** Loved sort — album fan count when known. */
  fanCount?: number;
  /** Volume sort — revenue earned by creator (yocto string) when known. */
  revenueNear?: string | null;
  view: CollectionView | null;
};

function rowToDiscoveryItem(
  row: ScarcesCollectionCurrentRow,
  extras?: { fanCount?: number; revenueNear?: string | null }
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
    ...(extras?.fanCount != null ? { fanCount: extras.fanCount } : {}),
    ...(extras?.revenueNear !== undefined
      ? { revenueNear: extras.revenueNear }
      : {}),
    view,
  };
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
  const sort = opts.sort ?? 'new';
  const mediumKind = opts.mediumKind?.trim().toLowerCase() || null;
  const limit = opts.limit ?? DROPS_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const client = opts.client ?? createReadOnlyOnSocialClient();
  const mediumFilter =
    mediumKind && mediumKind !== 'all'
      ? { mediumKind: mediumKind === 'music' ? 'audio' : mediumKind }
      : {};

  if (sort === 'saved') {
    const viewer = opts.viewerAccountId?.trim() ?? '';
    if (!viewer) return { items: [], hasMore: false };

    const saves = await client.query.saves.list(viewer, {
      limit: 500,
      offset: 0,
    });
    const collectionIds = saves
      .map((row) => parseScarceCollectionSavePath(row.contentPath))
      .filter((id): id is string => Boolean(id));
    // Preserve save order (newest first from list); page via offset/limit.
    const pageIds = collectionIds.slice(offset, offset + limit);
    if (pageIds.length === 0) {
      return { items: [], hasMore: false };
    }
    const shells = await client.query.scarces.collectionsCurrentByIds(pageIds);
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    const items: DropDiscoveryItem[] = [];
    for (const id of pageIds) {
      const shell = byId.get(id);
      if (!shell) continue;
      if (mediumFilter.mediumKind) {
        const rowMedium =
          shell.mediumKind?.trim().toLowerCase() ||
          (shell.kind?.trim().toLowerCase() === 'music'
            ? 'audio'
            : shell.kind?.trim().toLowerCase()) ||
          '';
        if (rowMedium !== mediumFilter.mediumKind) continue;
      }
      items.push(rowToDiscoveryItem(shell));
    }
    return {
      items,
      hasMore: offset + limit < collectionIds.length,
    };
  }

  if (sort === 'loved') {
    const loves = await client.query.scarces.albumLoveFans({ limit, offset });
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
      if (mediumFilter.mediumKind) {
        const rowMedium =
          shell.mediumKind?.trim().toLowerCase() ||
          (shell.kind?.trim().toLowerCase() === 'music'
            ? 'audio'
            : shell.kind?.trim().toLowerCase()) ||
          '';
        if (rowMedium !== mediumFilter.mediumKind) continue;
      }
      items.push(
        rowToDiscoveryItem(shell, {
          fanCount: love.fanCount,
        })
      );
    }
    return { items, hasMore: loves.length === limit };
  }

  const rows = await client.query.scarces.collectionsCurrent({
    limit,
    offset,
    orderBy:
      sort === 'minting' ? 'minting' : sort === 'volume' ? 'volume' : 'new',
    mintingOnly: sort === 'minting',
    ...mediumFilter,
  });
  return {
    items: rows.map((row) => rowToDiscoveryItem(row)),
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
