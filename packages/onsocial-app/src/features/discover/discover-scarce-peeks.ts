import type { OnSocial } from '@onsocial/sdk';

/** Network scarce peek row — most traded or most loved. */
export type DiscoverScarcePeek = {
  collectionId: string;
  title: string | null;
  appId: string | null;
};

const DEFAULT_LIMIT = 6;

async function hydrateScarcePeeks(
  client: OnSocial,
  ids: string[],
  appById: Map<string, string | null>
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
    out.push({
      collectionId: shell.collectionId,
      title: shell.title?.trim() || null,
      appId: shell.appId?.trim() || appById.get(id) || null,
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
    return await hydrateScarcePeeks(client, ids, appById);
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
    let ranks: Array<{ collectionId: string }> = [];
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
    return await hydrateScarcePeeks(client, ids, new Map());
  } catch {
    return [];
  }
}
