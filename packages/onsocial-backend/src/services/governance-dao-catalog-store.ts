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
    listedAt: toIso(row.listed_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function isOnSocialDaoAccountId(accountId: string): boolean {
  const id = accountId.trim().toLowerCase();
  return (
    id.endsWith('.onsocial.near') ||
    id.endsWith('.onsocial.testnet') ||
    id === 'onsocial.near' ||
    id === 'onsocial.testnet'
  );
}

/** Empty-browse tiers: seed → OnSocial host → has profile → listed_at. */
function emptyBrowseRankKey(
  row: Pick<CatalogDbRow, 'dao_account_id' | 'source' | 'listed_at'>,
  profiledIds: Set<string>
): [number, number, number, number, string] {
  const id = row.dao_account_id.trim().toLowerCase();
  const sourceTier = (row.source ?? '').trim().toLowerCase() === 'seed' ? 0 : 1;
  const onsocialTier = isOnSocialDaoAccountId(id) ? 0 : 1;
  const profileTier = profiledIds.has(id) ? 0 : 1;
  const listedMs = Date.parse(toIso(row.listed_at) ?? '') || 0;
  return [sourceTier, onsocialTier, profileTier, -listedMs, id];
}

function compareEmptyBrowseRank(
  a: [number, number, number, number, string],
  b: [number, number, number, number, string]
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  if (a[3] !== b[3]) return a[3] - b[3];
  return a[4].localeCompare(b[4]);
}

/**
 * Which catalog accounts already have an OnSocial `profile_search` row.
 * Soft-fails to empty set when the indexer is unreachable.
 */
async function loadProfiledCatalogAccountIds(
  accountIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(
    new Set(accountIds.map((id) => id.trim().toLowerCase()).filter(Boolean))
  );
  if (ids.length === 0) return new Set();

  const profiled = new Set<string>();
  const chunkSize = 500;
  try {
    for (let offset = 0; offset < ids.length; offset += chunkSize) {
      const chunk = ids.slice(offset, offset + chunkSize);
      const result = await indexerQuery<{ account_id: string }>(
        `SELECT account_id
           FROM profile_search
          WHERE account_id = ANY($1::text[])`,
        [chunk]
      );
      for (const row of result.rows) {
        const id = row.account_id?.trim().toLowerCase();
        if (id) profiled.add(id);
      }
    }
  } catch (err) {
    logger.warn(
      { err, sampleSize: ids.length },
      'DAO catalog profile promotion skipped (indexer unavailable)'
    );
    return new Set();
  }
  return profiled;
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
    const lightResult = await query<{
      dao_account_id: string;
      source: string;
      listed_at: string | Date;
    }>(
      `SELECT dao_account_id, source, listed_at
         FROM governance_dao_catalog`
    );
    const total = lightResult.rows.length;
    if (total === 0) {
      return { rows: [], total: 0 };
    }

    const profiledIds = await loadProfiledCatalogAccountIds(
      lightResult.rows.map((row) => row.dao_account_id)
    );
    const rankedIds = [...lightResult.rows]
      .sort((a, b) =>
        compareEmptyBrowseRank(
          emptyBrowseRankKey(a, profiledIds),
          emptyBrowseRankKey(b, profiledIds)
        )
      )
      .slice(offset, offset + limit)
      .map((row) => row.dao_account_id);

    if (rankedIds.length === 0) {
      return { rows: [], total };
    }

    const pageResult = await query<CatalogDbRow>(
      `SELECT *
         FROM governance_dao_catalog
        WHERE dao_account_id = ANY($1::text[])`,
      [rankedIds]
    );
    const byId = new Map(
      pageResult.rows.map((row) => [row.dao_account_id.toLowerCase(), row])
    );
    const page = rankedIds
      .map((id) => byId.get(id.toLowerCase()))
      .filter((row): row is CatalogDbRow => Boolean(row));

    return {
      rows: page.map(mapCatalogRow),
      total,
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
