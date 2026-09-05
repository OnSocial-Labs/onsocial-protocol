import type { OnSocial } from '@onsocial/sdk';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';

/** Network scarce peek row — most traded or most loved. */
export type DiscoverScarcePeek = {
  collectionId: string;
  title: string | null;
  appId: string | null;
  coverUrl?: string | null;
  signalCount?: number | null;
};

const DEFAULT_LIMIT = 6;

async function hydrateScarcePeeks(
  client: OnSocial,
  ids: string[],
  appById: Map<string, string | null>,
  signalById: Map<string, number>
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
    if (!shell) continue;
    const signal = signalById.get(id);
    out.push({
      collectionId: shell.collectionId,
      title: shell.title?.trim() || null,
      appId: shell.appId?.trim() || appById.get(id) || null,
      coverUrl: resolveScarceMediaUrl(shell.media),
      signalCount:
        signal != null && Number.isFinite(signal) && signal > 0 ? signal : null,
    });
  }
  return out;
}

/** Most-traded drops across all hubs (sales_volume desc). */
export async function fetchMostTradedScarcePeeks(
  client: OnSocial,
  limit = DEFAULT_LIMIT
): Promise<DiscoverScarcePeek[]> {
  try {
    const ranks = await client.query.scarces.collectionTradeStats({
      limit,
      offset: 0,
    });
    const ids = ranks.map((row) => row.collectionId.trim()).filter(Boolean);
    const appById = new Map(
      ranks.map((row) => [row.collectionId.trim(), row.appId] as const)
    );
    const signalById = new Map(
      ranks.map((row) => [
        row.collectionId.trim(),
        Number(row.salesCount) || 0,
      ] as const)
    );
    return await hydrateScarcePeeks(client, ids, appById, signalById);
  } catch {
    return [];
  }
}

/** Most-loved drops across all hubs (fan_count desc). */
export async function fetchMostLovedScarcePeeks(
  client: OnSocial,
  limit = DEFAULT_LIMIT
): Promise<DiscoverScarcePeek[]> {
  try {
    let ranks: Array<{ collectionId: string; fanCount?: number }> = [];
    try {
      ranks = await client.query.scarces.collectionLoveFans({
        limit,
        offset: 0,
      });
    } catch {
      ranks = await client.query.scarces.albumLoveFans({
        limit,
        offset: 0,
      });
    }
    const ids = ranks.map((row) => row.collectionId.trim()).filter(Boolean);
    const signalById = new Map(
      ranks.map((row) => [
        row.collectionId.trim(),
        Number(row.fanCount) || 0,
      ] as const)
    );
    return await hydrateScarcePeeks(client, ids, new Map(), signalById);
  } catch {
    return [];
  }
}
