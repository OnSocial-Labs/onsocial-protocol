import { query } from '../db/index.js';
import { indexerQuery } from '../db/indexer.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

export type DaoCatalogSource = 'factory' | 'seed' | 'manual';

export type DaoCatalogRow = {
  daoAccountId: string;
  factoryAccountId: string;
  network: string;
  source: DaoCatalogSource;
  name: string | null;
  purpose: string | null;
  metadata: string | null;
  factoryIndex: number | null;
  configSyncedAt: string | null;
  hasOnSocialProfile: boolean;
  profileSyncedAt: string | null;
  listedAt: string;
  updatedAt: string;
};

export type DaoFactorySyncState = {
  factoryAccountId: string;
  network: string;
  lastNumberDaos: number;
  lastFromIndex: number;
  lastFullScanAt: string | null;
  lastIncrementalAt: string | null;
  status: string;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

type CatalogDbRow = {
  dao_account_id: string;
  factory_account_id: string;
  network: string;
  source: string;
  name: string | null;
  purpose: string | null;
  metadata: string | null;
  factory_index: string | number | null;
  config_synced_at: string | Date | null;
  has_onsocial_profile?: boolean | null;
  profile_synced_at?: string | Date | null;
  listed_at: string | Date;
  updated_at: string | Date;
};

function mapCatalogRow(row: CatalogDbRow): DaoCatalogRow {
  const factoryIndex = Number(row.factory_index);
  return {
    daoAccountId: row.dao_account_id,
    factoryAccountId: row.factory_account_id,
    network: row.network,
    source: (row.source as DaoCatalogSource) || 'factory',
    name: row.name,
    purpose: row.purpose,
    metadata: row.metadata,
    factoryIndex:
      Number.isFinite(factoryIndex) && factoryIndex >= 0 ? factoryIndex : null,
    configSyncedAt: toIso(row.config_synced_at),
    hasOnSocialProfile: Boolean(row.has_onsocial_profile),
    profileSyncedAt: toIso(row.profile_synced_at),
    listedAt: toIso(row.listed_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

/**
 * Refresh `has_onsocial_profile` from indexer `profile_search`.
 * Soft-fails (returns 0) when the indexer is unreachable.
 */
export async function syncDaoCatalogProfileFlags(
  opts: { chunkSize?: number } = {}
): Promise<{ checked: number; profiled: number }> {
  const chunkSize = Math.min(Math.max(opts.chunkSize ?? 500, 50), 1000);
  const idsResult = await query<{ dao_account_id: string }>(
    `SELECT dao_account_id FROM governance_dao_catalog`
  );
  const ids = idsResult.rows
    .map((row) => row.dao_account_id.trim().toLowerCase())
    .filter(Boolean);
  if (ids.length === 0) return { checked: 0, profiled: 0 };

  let profiled = 0;
  try {
    for (let offset = 0; offset < ids.length; offset += chunkSize) {
      const chunk = ids.slice(offset, offset + chunkSize);
      const indexed = await indexerQuery<{ account_id: string }>(
        `SELECT account_id
           FROM profile_search
          WHERE account_id = ANY($1::text[])`,
        [chunk]
      );
      const profiledInChunk = new Set(
        indexed.rows
          .map((row) => row.account_id?.trim().toLowerCase())
          .filter((id): id is string => Boolean(id))
      );
      profiled += profiledInChunk.size;
      const profiledList = [...profiledInChunk];
      await query(
        `UPDATE governance_dao_catalog
            SET has_onsocial_profile = (dao_account_id = ANY($1::text[])),
                profile_synced_at = now(),
                updated_at = now()
          WHERE dao_account_id = ANY($2::text[])`,
        [profiledList, chunk]
      );
    }
  } catch (err) {
    logger.warn(
      { err, sampleSize: ids.length },
      'DAO catalog profile flag sync failed (indexer unavailable)'
    );
    return { checked: 0, profiled: 0 };
  }

  return { checked: ids.length, profiled };
}

export async function upsertDaoCatalogAccount(opts: {
  daoAccountId: string;
  factoryAccountId: string;
  network: string;
  source: DaoCatalogSource;
  factoryIndex?: number | null;
  name?: string | null;
  purpose?: string | null;
  metadata?: string | null;
  configSynced?: boolean;
}): Promise<void> {
  const daoAccountId = opts.daoAccountId.trim().toLowerCase();
  if (!daoAccountId) return;

  await query(
    `INSERT INTO governance_dao_catalog (
       dao_account_id,
       factory_account_id,
       network,
       source,
       name,
       purpose,
       metadata,
       factory_index,
       config_synced_at,
       listed_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       CASE WHEN $9::boolean THEN now() ELSE NULL END,
       now(),
       now()
     )
     ON CONFLICT (dao_account_id) DO UPDATE SET
       factory_account_id = COALESCE(
         NULLIF(excluded.factory_account_id, ''),
         governance_dao_catalog.factory_account_id
       ),
       network = excluded.network,
       source = CASE
         WHEN governance_dao_catalog.source = 'seed' THEN 'seed'
         WHEN excluded.source = 'seed' THEN 'seed'
         ELSE excluded.source
       END,
       name = COALESCE(excluded.name, governance_dao_catalog.name),
       purpose = COALESCE(excluded.purpose, governance_dao_catalog.purpose),
       metadata = COALESCE(excluded.metadata, governance_dao_catalog.metadata),
       factory_index = COALESCE(
         excluded.factory_index,
         governance_dao_catalog.factory_index
       ),
       config_synced_at = CASE
         WHEN $9::boolean THEN now()
         ELSE governance_dao_catalog.config_synced_at
       END,
       updated_at = now()`,
    [
      daoAccountId,
      opts.factoryAccountId.trim().toLowerCase(),
      opts.network,
      opts.source,
      opts.name?.trim() || null,
      opts.purpose?.trim() || null,
      opts.metadata ?? null,
      opts.factoryIndex ?? null,
      Boolean(opts.configSynced),
    ]
  );
}

export async function upsertDaoCatalogAccountsBatch(
  rows: Array<{
    daoAccountId: string;
    factoryAccountId: string;
    network: string;
    source: DaoCatalogSource;
    factoryIndex?: number | null;
  }>
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    await upsertDaoCatalogAccount(row);
    count += 1;
  }
  return count;
}

export async function ensureSeedDaoCatalogRows(): Promise<void> {
  const network = config.nearNetwork === 'mainnet' ? 'mainnet' : 'testnet';
  const factoryAccountId = config.sputnikDaoFactory;
  await upsertDaoCatalogAccount({
    daoAccountId: config.governanceDao,
    factoryAccountId,
    network,
    source: 'seed',
    name: 'OnSocial Governance',
    purpose: 'Protocol policy and upgrades',
    configSynced: true,
  });
  await upsertDaoCatalogAccount({
    daoAccountId: config.treasuryDao,
    factoryAccountId,
    network,
    source: 'seed',
    name: 'OnSocial Treasury',
    purpose: 'Protocol treasury decisions',
    configSynced: true,
  });
}

export async function searchDaoCatalog(opts: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: DaoCatalogRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.query?.trim().toLowerCase() ?? '';

  if (!q) {
    const [rowsResult, countResult] = await Promise.all([
      query<CatalogDbRow>(
        `SELECT *
           FROM governance_dao_catalog
          ORDER BY
            CASE source WHEN 'seed' THEN 0 ELSE 1 END,
            CASE
              WHEN lower(dao_account_id) LIKE '%.onsocial.near'
                OR lower(dao_account_id) LIKE '%.onsocial.testnet'
                OR lower(dao_account_id) IN ('onsocial.near', 'onsocial.testnet')
              THEN 0
              ELSE 1
            END,
            CASE WHEN has_onsocial_profile THEN 0 ELSE 1 END,
            listed_at DESC,
            dao_account_id ASC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM governance_dao_catalog`
      ),
    ]);
    return {
      rows: rowsResult.rows.map(mapCatalogRow),
      total: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  const like = `%${q.replace(/[%_]/g, '')}%`;
  const [rowsResult, countResult] = await Promise.all([
    query<CatalogDbRow>(
      `SELECT *
         FROM governance_dao_catalog
        WHERE lower(dao_account_id) LIKE $1
           OR lower(coalesce(name, '')) LIKE $1
           OR lower(coalesce(purpose, '')) LIKE $1
        ORDER BY
          CASE
            WHEN lower(dao_account_id) = $2 THEN 0
            WHEN lower(dao_account_id) LIKE $2 || '%' THEN 1
            WHEN lower(coalesce(name, '')) LIKE $2 || '%' THEN 2
            ELSE 3
          END,
          listed_at DESC,
          dao_account_id ASC
        LIMIT $3 OFFSET $4`,
      [like, q, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM governance_dao_catalog
        WHERE lower(dao_account_id) LIKE $1
           OR lower(coalesce(name, '')) LIKE $1
           OR lower(coalesce(purpose, '')) LIKE $1`,
      [like]
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapCatalogRow),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getDaoCatalogRow(
  daoAccountIdInput: string
): Promise<DaoCatalogRow | null> {
  const daoAccountId = daoAccountIdInput.trim().toLowerCase();
  if (!daoAccountId) return null;
  const result = await query<{
    dao_account_id: string;
    factory_account_id: string;
    network: string;
    source: string;
    name: string | null;
    purpose: string | null;
    metadata: string | null;
    factory_index: string | number | null;
    config_synced_at: string | Date | null;
    listed_at: string | Date;
    updated_at: string | Date;
  }>(`SELECT * FROM governance_dao_catalog WHERE dao_account_id = $1`, [
    daoAccountId,
  ]);
  const row = result.rows[0];
  return row ? mapCatalogRow(row) : null;
}

export type DaoPortfolioProfileShell = {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
};

/** Catalog row + indexed profile shell for DAO portfolio SSR (one round trip). */
export async function getDaoPortfolioPageBundle(
  daoAccountIdInput: string
): Promise<{
  catalog: DaoCatalogRow | null;
  profile: DaoPortfolioProfileShell | null;
}> {
  const daoAccountId = daoAccountIdInput.trim().toLowerCase();
  if (!daoAccountId) {
    return { catalog: null, profile: null };
  }

  const [catalog, profileResult] = await Promise.all([
    getDaoCatalogRow(daoAccountId),
    indexerQuery<{
      account_id: string;
      name: string | null;
      bio: string | null;
      avatar: string | null;
      banner: string | null;
    }>(
      `SELECT account_id, name, bio, avatar, banner
         FROM profile_search
        WHERE account_id = $1
        LIMIT 1`,
      [daoAccountId]
    ).catch((err) => {
      logger.warn(
        { err, daoAccountId },
        'dao portfolio page bundle profile lookup failed'
      );
      return { rows: [] as Array<{
        account_id: string;
        name: string | null;
        bio: string | null;
        avatar: string | null;
        banner: string | null;
      }> };
    }),
  ]);

  const profileRow = profileResult.rows[0];
  const profile = profileRow
    ? {
        accountId: profileRow.account_id,
        name: profileRow.name ?? null,
        bio: profileRow.bio ?? null,
        avatar: profileRow.avatar ?? null,
        banner: profileRow.banner ?? null,
      }
    : null;

  return { catalog, profile };
}

/** Batch catalog lookup for standing / directory enrichment (capped). */
export async function getDaoCatalogRowsByIds(
  daoAccountIds: string[],
  limit = 64
): Promise<DaoCatalogRow[]> {
  const ids = Array.from(
    new Set(
      daoAccountIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) => /^[a-z0-9][a-z0-9._-]{1,63}$/.test(id))
    )
  ).slice(0, Math.min(Math.max(limit, 1), 64));

  if (ids.length === 0) return [];

  const result = await query<{
    dao_account_id: string;
    factory_account_id: string;
    network: string;
    source: string;
    name: string | null;
    purpose: string | null;
    metadata: string | null;
    factory_index: string | number | null;
    config_synced_at: string | Date | null;
    listed_at: string | Date;
    updated_at: string | Date;
  }>(
    `SELECT *
       FROM governance_dao_catalog
      WHERE dao_account_id = ANY($1::text[])`,
    [ids]
  );

  return result.rows.map(mapCatalogRow);
}

export async function listDaoCatalogMissingConfig(
  limit = 20
): Promise<string[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const result = await query<{ dao_account_id: string }>(
    `SELECT dao_account_id
       FROM governance_dao_catalog
      WHERE config_synced_at IS NULL
        AND source <> 'seed'
      ORDER BY listed_at DESC
      LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => row.dao_account_id);
}

export async function countDaoCatalog(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM governance_dao_catalog`
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function loadFactorySyncState(
  factoryAccountId: string
): Promise<DaoFactorySyncState | null> {
  const id = factoryAccountId.trim().toLowerCase();
  const result = await query<{
    factory_account_id: string;
    network: string;
    last_number_daos: string | number;
    last_from_index: string | number;
    last_full_scan_at: string | Date | null;
    last_incremental_at: string | Date | null;
    status: string;
  }>(
    `SELECT *
       FROM governance_dao_factory_sync
      WHERE factory_account_id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    factoryAccountId: row.factory_account_id,
    network: row.network,
    lastNumberDaos: Number(row.last_number_daos) || 0,
    lastFromIndex: Number(row.last_from_index) || 0,
    lastFullScanAt: toIso(row.last_full_scan_at),
    lastIncrementalAt: toIso(row.last_incremental_at),
    status: row.status,
  };
}

export async function saveFactorySyncState(opts: {
  factoryAccountId: string;
  network: string;
  lastNumberDaos: number;
  lastFromIndex: number;
  status: string;
  markFullScan?: boolean;
  markIncremental?: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO governance_dao_factory_sync (
       factory_account_id,
       network,
       last_number_daos,
       last_from_index,
       last_full_scan_at,
       last_incremental_at,
       status
     ) VALUES (
       $1, $2, $3, $4,
       CASE WHEN $5::boolean THEN now() ELSE NULL END,
       CASE WHEN $6::boolean THEN now() ELSE NULL END,
       $7
     )
     ON CONFLICT (factory_account_id) DO UPDATE SET
       network = excluded.network,
       last_number_daos = excluded.last_number_daos,
       last_from_index = excluded.last_from_index,
       last_full_scan_at = CASE
         WHEN $5::boolean THEN now()
         ELSE governance_dao_factory_sync.last_full_scan_at
       END,
       last_incremental_at = CASE
         WHEN $6::boolean THEN now()
         ELSE governance_dao_factory_sync.last_incremental_at
       END,
       status = excluded.status`,
    [
      opts.factoryAccountId.trim().toLowerCase(),
      opts.network,
      opts.lastNumberDaos,
      opts.lastFromIndex,
      Boolean(opts.markFullScan),
      Boolean(opts.markIncremental),
      opts.status,
    ]
  );
}
