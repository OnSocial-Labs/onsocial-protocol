import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { viewContractAt } from './near.js';
import {
  countDaoCatalog,
  ensureSeedDaoCatalogRows,
  listDaoCatalogMissingConfig,
  loadFactorySyncState,
  refreshProtocolDaoCatalogFromChain,
  saveFactorySyncState,
  syncDaoCatalogConfigFromChain,
  syncDaoCatalogProfileFlags,
  upsertDaoCatalogAccount,
  upsertDaoCatalogAccountsBatch,
} from './governance-dao-catalog-store.js';

const FACTORY_PAGE_SIZE = 100;
const FACTORY_PAGE_PAUSE_MS = 150;
const ENRICH_BATCH_SIZE = 15;
const ENRICH_PAUSE_MS = 120;
const INCREMENTAL_INTERVAL_MS = 10 * 60_000;

function normalizeDaoAccountId(value: string): string {
  return value.trim().toLowerCase();
}

function isProtocolDaoAccountId(daoAccountId: string): boolean {
  const id = normalizeDaoAccountId(daoAccountId);
  return (
    id === config.governanceDao.trim().toLowerCase() ||
    id === config.treasuryDao.trim().toLowerCase()
  );
}

function isChangeConfigKind(
  kind: Record<string, unknown> | null | undefined
): boolean {
  return Boolean(kind && typeof kind === 'object' && 'ChangeConfig' in kind);
}

/** Whether an approved ChangeConfig should trigger immediate catalog refresh. */
export function shouldRefreshProtocolCatalogAfterProposal(opts: {
  daoAccountId: string;
  status: string | null | undefined;
  previousStatus: string | null | undefined;
  kind: Record<string, unknown> | null | undefined;
}): boolean {
  if (!isProtocolDaoAccountId(opts.daoAccountId)) return false;
  if (opts.status?.trim() !== 'Approved') return false;
  if (opts.previousStatus?.trim() === 'Approved') return false;
  return isChangeConfigKind(opts.kind);
}

/** Refresh protocol DAO catalog when ChangeConfig executes (purpose / metadata). */
export function scheduleProtocolDaoCatalogSyncAfterProposal(
  daoAccountId: string,
  proposal: {
    status?: string | null;
    kind?: Record<string, unknown> | null;
  },
  previous: { status?: string | null } | null
): void {
  if (
    !shouldRefreshProtocolCatalogAfterProposal({
      daoAccountId,
      status: proposal.status,
      previousStatus: previous?.status,
      kind: proposal.kind,
    })
  ) {
    return;
  }

  void syncDaoCatalogConfigFromChain(
    normalizeDaoAccountId(daoAccountId),
    'seed'
  ).catch((error) => {
    logger.warn(
      { err: error, daoAccountId },
      'Protocol DAO catalog refresh after ChangeConfig failed'
    );
  });
}

let catalogSyncInFlight: Promise<void> | null = null;
let enrichInFlight: Promise<void> | null = null;
let profileFlagsInFlight: Promise<void> | null = null;
let incrementalTimer: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function networkLabel(): 'mainnet' | 'testnet' {
  return config.nearNetwork === 'mainnet' ? 'mainnet' : 'testnet';
}

async function readFactoryDaoCount(factoryAccountId: string): Promise<number> {
  const raw = await viewContractAt<number | string>(
    factoryAccountId,
    'get_number_daos',
    {}
  );
  const count = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('Factory get_number_daos returned an invalid count.');
  }
  return Math.trunc(count);
}

async function readFactoryDaoPage(
  factoryAccountId: string,
  fromIndex: number,
  limit: number
): Promise<string[]> {
  const page = await viewContractAt<string[]>(factoryAccountId, 'get_daos', {
    from_index: fromIndex,
    limit,
  });
  if (!Array.isArray(page)) return [];
  return page
    .map((id) => (typeof id === 'string' ? id.trim().toLowerCase() : ''))
    .filter(Boolean);
}

async function enrichDaoConfig(daoAccountId: string): Promise<void> {
  const synced = await syncDaoCatalogConfigFromChain(daoAccountId, 'factory');
  if (synced) return;

  await upsertDaoCatalogAccount({
    daoAccountId,
    factoryAccountId: config.sputnikDaoFactory,
    network: networkLabel(),
    source: 'factory',
    configSynced: true,
  });
}

/**
 * Sync factory DAO account ids into the catalog (IDs first, names later).
 * Appends new pages when factory count grows; full rescan heals gaps.
 */
export async function syncDaoCatalogFromFactory(
  opts: { full?: boolean } = {}
): Promise<{ synced: number; factoryCount: number }> {
  const factoryAccountId = config.sputnikDaoFactory;
  const network = networkLabel();
  await ensureSeedDaoCatalogRows();

  const factoryCount = await readFactoryDaoCount(factoryAccountId);
  const prior = await loadFactorySyncState(factoryAccountId);
  let fromIndex =
    opts.full || !prior ? 0 : Math.min(prior.lastFromIndex, factoryCount);
  if (!opts.full && prior && factoryCount <= prior.lastNumberDaos) {
    fromIndex = factoryCount;
  }

  await saveFactorySyncState({
    factoryAccountId,
    network,
    lastNumberDaos: factoryCount,
    lastFromIndex: fromIndex,
    status: 'syncing',
    markIncremental: true,
  });

  let synced = 0;
  while (fromIndex < factoryCount) {
    const page = await readFactoryDaoPage(
      factoryAccountId,
      fromIndex,
      FACTORY_PAGE_SIZE
    );
    if (page.length === 0) break;

    await upsertDaoCatalogAccountsBatch(
      page.map((daoAccountId, index) => ({
        daoAccountId,
        factoryAccountId,
        network,
        source: 'factory' as const,
        factoryIndex: fromIndex + index,
      }))
    );
    synced += page.length;
    fromIndex += page.length;
    await saveFactorySyncState({
      factoryAccountId,
      network,
      lastNumberDaos: factoryCount,
      lastFromIndex: fromIndex,
      status: 'syncing',
      markIncremental: true,
    });
    if (page.length < FACTORY_PAGE_SIZE) break;
    await sleep(FACTORY_PAGE_PAUSE_MS);
  }

  await saveFactorySyncState({
    factoryAccountId,
    network,
    lastNumberDaos: factoryCount,
    lastFromIndex: fromIndex,
    status: 'idle',
    markFullScan: Boolean(opts.full) || fromIndex >= factoryCount,
    markIncremental: true,
  });

  return { synced, factoryCount };
}

export async function enrichDaoCatalogConfigs(
  limit = ENRICH_BATCH_SIZE
): Promise<number> {
  const missing = await listDaoCatalogMissingConfig(limit);
  let enriched = 0;
  for (const daoAccountId of missing) {
    try {
      await enrichDaoConfig(daoAccountId);
      enriched += 1;
    } catch (error) {
      logger.warn(
        { err: error, daoAccountId },
        'DAO catalog config enrich failed'
      );
      await upsertDaoCatalogAccount({
        daoAccountId,
        factoryAccountId: config.sputnikDaoFactory,
        network: networkLabel(),
        source: 'factory',
        configSynced: true,
      });
    }
    await sleep(ENRICH_PAUSE_MS);
  }
  return enriched;
}

/** Resolve a DAO by exact account id — upserts into catalog when get_config works. */
export async function resolveDaoCatalogAccount(
  daoAccountIdInput: string
): Promise<{
  daoAccountId: string;
  name: string | null;
  purpose: string | null;
} | null> {
  const daoAccountId = daoAccountIdInput.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(daoAccountId)) {
    return null;
  }

  const synced = await syncDaoCatalogConfigFromChain(daoAccountId, 'manual');
  if (!synced) return null;

  return {
    daoAccountId,
    name: synced.name,
    purpose: synced.purpose,
  };
}

export async function runDaoCatalogSyncCycle(
  opts: { full?: boolean } = {}
): Promise<void> {
  if (catalogSyncInFlight) {
    await catalogSyncInFlight;
    return;
  }

  catalogSyncInFlight = (async () => {
    try {
      const { synced, factoryCount } = await syncDaoCatalogFromFactory(opts);
      if (synced > 0) {
        logger.info(
          { synced, factoryCount, factory: config.sputnikDaoFactory },
          'Synced Sputnik DAO catalog from factory'
        );
      }
    } catch (error) {
      logger.warn({ err: error }, 'DAO catalog factory sync failed');
      await saveFactorySyncState({
        factoryAccountId: config.sputnikDaoFactory,
        network: networkLabel(),
        lastNumberDaos:
          (await loadFactorySyncState(config.sputnikDaoFactory))
            ?.lastNumberDaos ?? 0,
        lastFromIndex:
          (await loadFactorySyncState(config.sputnikDaoFactory))
            ?.lastFromIndex ?? 0,
        status: 'error',
      }).catch(() => undefined);
    } finally {
      catalogSyncInFlight = null;
    }
  })();

  await catalogSyncInFlight;

  if (!enrichInFlight) {
    enrichInFlight = (async () => {
      try {
        await refreshProtocolDaoCatalogFromChain();
        const enriched = await enrichDaoCatalogConfigs();
        if (enriched > 0) {
          logger.info({ enriched }, 'Enriched DAO catalog configs');
        }
      } catch (error) {
        logger.warn({ err: error }, 'DAO catalog enrich cycle failed');
      } finally {
        enrichInFlight = null;
      }
    })();
  }

  if (!profileFlagsInFlight) {
    profileFlagsInFlight = syncDaoCatalogProfileFlags()
      .then((result) => {
        if (result.checked > 0) {
          logger.info(
            { checked: result.checked, profiled: result.profiled },
            'Synced DAO catalog OnSocial profile flags'
          );
        }
      })
      .catch((error) => {
        logger.warn({ err: error }, 'DAO catalog profile flag sync failed');
      })
      .finally(() => {
        profileFlagsInFlight = null;
      });
  }
}

export function startDaoCatalogSyncInBackground(): void {
  void runDaoCatalogSyncCycle({ full: false });

  if (incrementalTimer) return;
  incrementalTimer = setInterval(() => {
    void runDaoCatalogSyncCycle({ full: false });
  }, INCREMENTAL_INTERVAL_MS);
  incrementalTimer.unref();
}

export function stopDaoCatalogSyncInBackground(): void {
  if (incrementalTimer) {
    clearInterval(incrementalTimer);
    incrementalTimer = null;
  }
}

export async function getDaoCatalogSyncStatus(): Promise<{
  factoryAccountId: string;
  indexedCount: number;
  factoryCount: number;
  lastFromIndex: number;
  status: string;
  syncing: boolean;
}> {
  const factoryAccountId = config.sputnikDaoFactory;
  const [indexedCount, state] = await Promise.all([
    countDaoCatalog(),
    loadFactorySyncState(factoryAccountId),
  ]);
  const factoryCount = state?.lastNumberDaos ?? 0;
  const lastFromIndex = state?.lastFromIndex ?? 0;
  const status = state?.status ?? 'idle';
  return {
    factoryAccountId,
    indexedCount,
    factoryCount,
    lastFromIndex,
    status,
    syncing: status === 'syncing' || lastFromIndex < factoryCount,
  };
}
