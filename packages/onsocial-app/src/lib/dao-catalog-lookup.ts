import { cache } from 'react';
import { ACTIVE_BACKEND_URL } from '@/lib/app-config';

export type DaoCatalogLookupRow = {
  daoAccountId: string;
  name: string | null;
  purpose: string | null;
  metadata: string | null;
  source: string;
  listedAt: string;
};

export type DaoPortfolioProfileBundle = {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
};

export type DaoPortfolioPageBundle = {
  dao: DaoCatalogLookupRow | null;
  profile: DaoPortfolioProfileBundle | null;
};

const LOOKUP_IDS_LIMIT = 64;

function mapCatalogRow(row: {
  daoAccountId: string;
  name?: string | null;
  purpose?: string | null;
  metadata?: string | null;
  source: string;
  listedAt: string;
}): DaoCatalogLookupRow {
  return {
    daoAccountId: row.daoAccountId.trim().toLowerCase(),
    name: row.name ?? null,
    purpose: row.purpose ?? null,
    metadata: row.metadata ?? null,
    source: row.source,
    listedAt: row.listedAt,
  };
}

async function fetchDaoCatalogByIds(
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
      byId.set(id, mapCatalogRow({ ...row, daoAccountId: id }));
    }
  } catch {
    // Catalog is optional — standing lists still work without DAO enrichment.
  }

  return byId;
}

/** Catalog + indexed profile shell for DAO portfolio SSR (one backend round trip). */
export const fetchDaoPortfolioPageBundle = cache(
  async (accountId: string): Promise<DaoPortfolioPageBundle> => {
    const id = accountId.trim().toLowerCase();
    if (!id || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) {
      return { dao: null, profile: null };
    }

    try {
      const params = new URLSearchParams({ accountId: id });
      const response = await fetch(
        `${ACTIVE_BACKEND_URL.replace(/\/$/, '')}/v1/governance/daos/page?${params}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        return { dao: null, profile: null };
      }

      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        dao?: DaoCatalogLookupRow | null;
        profile?: DaoPortfolioProfileBundle | null;
      } | null;

      if (!body || body.success === false) {
        return { dao: null, profile: null };
      }

      return {
        dao: body.dao?.daoAccountId
          ? mapCatalogRow(body.dao)
          : null,
        profile: body.profile?.accountId
          ? {
              accountId: body.profile.accountId.trim().toLowerCase(),
              name: body.profile.name ?? null,
              bio: body.profile.bio ?? null,
              avatar: body.profile.avatar ?? null,
              banner: body.profile.banner ?? null,
            }
          : null,
      };
    } catch {
      return { dao: null, profile: null };
    }
  }
);

/** Server-side batch catalog lookup for standing enrichment. */
export async function lookupDaoCatalogByIds(
  accountIds: string[]
): Promise<Map<string, DaoCatalogLookupRow>> {
  return fetchDaoCatalogByIds(accountIds);
}

/** Per-request dedupe for portfolio / standing single-id lookups. */
export const lookupDaoCatalogById = cache(
  async (accountId: string): Promise<DaoCatalogLookupRow | null> => {
    const id = accountId.trim().toLowerCase();
    if (!id) return null;
    const byId = await fetchDaoCatalogByIds([id]);
    return byId.get(id) ?? null;
  }
);
