import { ACTIVE_BACKEND_URL } from '@/lib/app-config';

export type DaoCatalogLookupRow = {
  daoAccountId: string;
  name: string | null;
  purpose: string | null;
  metadata: string | null;
  source: string;
  listedAt: string;
};

const LOOKUP_IDS_LIMIT = 64;

/** Server-side batch catalog lookup for standing enrichment. */
export async function lookupDaoCatalogByIds(
  accountIds: string[]
): Promise<Map<string, DaoCatalogLookupRow>> {
  const ids = Array.from(
    new Set(
      accountIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) => /^[a-z0-9][a-z0-9._-]{1,63}$/.test(id))
    )
  ).slice(0, LOOKUP_IDS_LIMIT);

  const byId = new Map<string, DaoCatalogLookupRow>();
  if (ids.length === 0) return byId;

  try {
    const params = new URLSearchParams({ ids: ids.join(',') });
    const response = await fetch(
      `${ACTIVE_BACKEND_URL.replace(/\/$/, '')}/v1/governance/daos/lookup?${params}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return byId;

    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      daos?: DaoCatalogLookupRow[];
    } | null;

    if (!body || body.success === false || !Array.isArray(body.daos)) {
      return byId;
    }

    for (const row of body.daos) {
      const id = row.daoAccountId?.trim().toLowerCase();
      if (!id) continue;
      byId.set(id, {
        daoAccountId: id,
        name: row.name ?? null,
        purpose: row.purpose ?? null,
        metadata: row.metadata ?? null,
        source: row.source,
        listedAt: row.listedAt,
      });
    }
  } catch {
    // Catalog is optional — standing lists still work without DAO enrichment.
  }

  return byId;
}
