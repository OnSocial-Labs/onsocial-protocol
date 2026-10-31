import type { OnSocial, ScarcesEventRow } from '@onsocial/sdk';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import {
  collectionIdFromSaleEvent,
  justSoldCollectionRefs,
} from '@/lib/discover-moving';

/** Network scarce peek row — last sale on Moving. */
export type DiscoverScarcePeek = {
  collectionId: string;
  title: string | null;
  appId: string | null;
  coverUrl?: string | null;
  signalCount?: number | null;
  lastSaleTimestamp?: number | null;
};

const DEFAULT_LIMIT = 6;

async function hydrateScarcePeeks(
  client: OnSocial,
  ids: string[],
  appById: Map<string, string | null>,
  signalById: Map<string, number>,
  lastSaleById?: Map<string, number>
): Promise<DiscoverScarcePeek[]> {
  if (ids.length === 0) return [];
  const shells = await client.query.scarces
    .collectionsCurrentByIds(ids)
    .catch(() => []);
  const byId = new Map(
    shells.map((row) => [row.collectionId.trim(), row] as const)
  );
  const out: DiscoverScarcePeek[] = [];
  for (const id of ids) {
    const shell = byId.get(id);
    const signal = signalById.get(id);
    const lastSale = lastSaleById?.get(id);
    const lastSaleTimestamp =
      lastSale != null && Number.isFinite(lastSale) && lastSale > 0
        ? lastSale
        : null;
    if (!shell) {
      out.push({
        collectionId: id,
        title: null,
        appId: appById.get(id) || null,
        lastSaleTimestamp,
      });
      continue;
    }
    out.push({
      collectionId: shell.collectionId,
      title: shell.title?.trim() || null,
      appId: shell.appId?.trim() || appById.get(id) || null,
      coverUrl: resolveScarceMediaUrl(shell.media),
      signalCount:
        signal != null && Number.isFinite(signal) && signal > 0 ? signal : null,
      lastSaleTimestamp,
    });
  }
  return out;
}

const JUST_SOLD_POOL = 24;

async function resolveSaleCollectionIds(
  client: OnSocial,
  sales: ScarcesEventRow[]
): Promise<ScarcesEventRow[]> {
  const missingTokenIds = [
    ...new Set(
      sales
        .filter((row) => !collectionIdFromSaleEvent(row))
        .map((row) => row.tokenId?.trim() ?? '')
        .filter((id) => id.length > 0)
    ),
  ];
  if (missingTokenIds.length === 0) return sales;
  const tokens = await client.query.scarces.tokensByIds(missingTokenIds);
  const byToken = new Map(
    tokens.flatMap((row) => {
      const tokenId = row.tokenId.trim();
      const collectionId = row.collectionId?.trim() ?? '';
      if (!tokenId || !collectionId) return [];
      return [
        [tokenId, { collectionId, appId: row.appId?.trim() || null }] as const,
      ];
    })
  );
  return sales.map((row) => {
    if (collectionIdFromSaleEvent(row)) return row;
    const resolved = byToken.get(row.tokenId?.trim() ?? '');
    if (!resolved) return row;
    return {
      ...row,
      collectionId: resolved.collectionId,
      appId: row.appId?.trim() || resolved.appId,
    };
  });
}

/** Last sale per drop, newest first — Moving Just sold. */
export async function fetchJustSoldScarcePeeks(
  client: OnSocial,
  limit = DEFAULT_LIMIT
): Promise<DiscoverScarcePeek[]> {
  try {
    const sales = await client.query.scarces.recentCollectionSales({
      limit: JUST_SOLD_POOL,
    });
    const resolved = await resolveSaleCollectionIds(client, sales);
    const refs = justSoldCollectionRefs(resolved, limit);
    const ids = refs.map((row) => row.collectionId);
    const appById = new Map(
      refs.map((row) => [row.collectionId, row.appId] as const)
    );
    const lastSaleById = new Map(
      refs.map((row) => [row.collectionId, row.lastSaleTimestamp] as const)
    );
    return await hydrateScarcePeeks(
      client,
      ids,
      appById,
      new Map(),
      lastSaleById
    );
  } catch {
    return [];
  }
}
