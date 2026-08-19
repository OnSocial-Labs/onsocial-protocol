import { Router } from 'express';
import type { Request, Response } from 'express';
import { subscribeDaoProposalUpdates } from '../services/governance-proposal-events.js';
import { config } from '../config/index.js';
import {
  getGovernanceFeedApplications,
  parseGovernanceFeedScope,
} from '../services/governance-feed.js';
import { getDaoGovernanceRecent } from '../services/governance-dao-recent.js';
import { getDaoGovernancePolicy } from '../services/governance-dao-policy.js';
import { syncDaoProposalById } from '../services/governance-dao-proposal-sync.js';
import { loadPersistedPolicySnapshot } from '../services/governance-proposal-policy-store.js';
import {
  listIndexedDaoAccountIds,
  listMyDaoMemberships,
} from '../services/governance-dao-membership-store.js';
import {
  searchDaoCatalog,
  getDaoCatalogRowsByIds,
  getDaoPortfolioPageBundle,
} from '../services/governance-dao-catalog-store.js';
import {
  getDaoCatalogSyncStatus,
  resolveDaoCatalogAccount,
} from '../services/governance-dao-catalog-sync.js';
import { getDaoProposalPeeks } from '../services/governance-dao-proposal-peeks.js';
import {
  DAO_PROPOSAL_PEEK_DAO_LIMIT,
  DAO_PROPOSAL_PEEK_ROW_LIMIT,
} from '../services/governance-dao-ids.js';

const router = Router();

function readProposalId(value: unknown): number | null {
  const proposalId =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  return proposalId;
}

function readRecentLimit(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(parsed, 40);
}

function readDaoAccountId(value: unknown): string {
  const daoAccountId =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : config.governanceDao;

  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(daoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }

  return daoAccountId;
}

function readAccountId(value: unknown): string {
  const accountId =
    typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : '';

  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(accountId)) {
    throw new Error('Invalid accountId');
  }

  return accountId;
}

router.get('/feed', async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = parseGovernanceFeedScope(req.query.scope);
    const daoAccountId = readDaoAccountId(req.query.daoAccountId);
    const { applications, daoPolicy, syncing } =
      await getGovernanceFeedApplications(scope, daoAccountId);

    res.json({
      success: true,
      scope,
      daoAccountId,
      applications,
      daoPolicy,
      syncing,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.get('/events', (req: Request, res: Response): void => {
  try {
    const daoAccountId = readDaoAccountId(req.query.daoAccountId);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: ready\ndata: ${JSON.stringify({ daoAccountId })}\n\n`);

    const unsubscribe = subscribeDaoProposalUpdates((event) => {
      if (event.daoAccountId !== daoAccountId) {
        return;
      }

      res.write(
        `event: proposal-updated\ndata: ${JSON.stringify({
          daoAccountId: event.daoAccountId,
          proposalId: event.proposalId,
        })}\n\n`
      );
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.end();
  }
});

router.get('/recent', async (req: Request, res: Response): Promise<void> => {
  try {
    const daoAccountId = readDaoAccountId(req.query.daoAccountId);
    const limit = readRecentLimit(req.query.limit);
    const { proposals, daoPolicy } = await getDaoGovernanceRecent(
      daoAccountId,
      limit
    );

    res.json({
      success: true,
      daoAccountId,
      limit,
      proposals,
      daoPolicy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

/**
 * Multi-DAO proposal peeks for DAOs Home (snapshot read + background sync kick).
 * Query: daoAccountIds=a.near,b.near&limit=24
 */
router.get(
  '/proposal-peeks',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.query.daoAccountIds;
      const joined =
        typeof raw === 'string'
          ? raw
          : Array.isArray(raw)
            ? raw.map(String).join(',')
            : '';
      const daoAccountIds = joined
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, DAO_PROPOSAL_PEEK_DAO_LIMIT);

      if (daoAccountIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'daoAccountIds query parameter is required',
        });
        return;
      }

      const limitRaw = Number.parseInt(String(req.query.limit ?? ''), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), DAO_PROPOSAL_PEEK_ROW_LIMIT)
        : DAO_PROPOSAL_PEEK_ROW_LIMIT;

      const result = await getDaoProposalPeeks(daoAccountIds, limit);

      res.json({
        success: true,
        daoAccountIds: result.daoAccountIds,
        limit: result.limit,
        peeks: result.peeks,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
    }
  }
);

router.get('/policy', async (req: Request, res: Response): Promise<void> => {
  try {
    const daoAccountId = readDaoAccountId(req.query.daoAccountId);
    const daoPolicy = await getDaoGovernancePolicy(daoAccountId);

    res.json({
      success: true,
      daoAccountId,
      daoPolicy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/proposal', async (req: Request, res: Response): Promise<void> => {
  try {
    const proposalId = readProposalId(req.query.proposalId);
    if (proposalId === null) {
      res.status(400).json({
        success: false,
        error: 'A valid proposalId query parameter is required',
      });
      return;
    }

    const daoAccountId = readDaoAccountId(req.query.daoAccountId);
    const live =
      req.query.live === 'true' ||
      req.query.live === '1' ||
      req.query.live === 'yes';

    const proposal = await syncDaoProposalById(daoAccountId, proposalId, {
      live,
    });

    res.json({
      success: true,
      daoAccountId,
      proposalId,
      live,
      proposal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/daos', async (req: Request, res: Response): Promise<void> => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitRaw = Number.parseInt(String(req.query.limit ?? '20'), 10);
    const offsetRaw = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

    let { rows, total } = await searchDaoCatalog({ query: q, limit, offset });

    // Exact account search: resolve live get_config and upsert if missing.
    if (
      q &&
      rows.length === 0 &&
      /^[a-z0-9][a-z0-9._-]{1,63}$/.test(q.toLowerCase())
    ) {
      const resolved = await resolveDaoCatalogAccount(q);
      if (resolved) {
        ({ rows, total } = await searchDaoCatalog({ query: q, limit, offset }));
      }
    }

    const sync = await getDaoCatalogSyncStatus();

    res.json({
      success: true,
      q: q || null,
      limit: Math.min(Math.max(limit, 1), 50),
      offset: Math.max(offset, 0),
      total,
      daos: rows.map((row) => ({
        daoAccountId: row.daoAccountId,
        name: row.name,
        purpose: row.purpose,
        metadata: row.metadata,
        source: row.source,
        listedAt: row.listedAt,
        hasOnSocialProfile: row.hasOnSocialProfile,
      })),
      factoryAccountId: sync.factoryAccountId,
      indexedCount: sync.indexedCount,
      factoryCount: sync.factoryCount,
      syncing: sync.syncing,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

/** Batch lookup by account ids — standing / directory enrichment. */
router.get('/daos/page', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId =
      typeof req.query.accountId === 'string' ? req.query.accountId : '';
    const bundle = await getDaoPortfolioPageBundle(accountId);
    res.json({
      success: true,
      dao: bundle.catalog
        ? {
            daoAccountId: bundle.catalog.daoAccountId,
            name: bundle.catalog.name,
            purpose: bundle.catalog.purpose,
            metadata: bundle.catalog.metadata,
            source: bundle.catalog.source,
            listedAt: bundle.catalog.listedAt,
            hasOnSocialProfile: bundle.catalog.hasOnSocialProfile,
          }
        : null,
      profile: bundle.profile,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

router.get(
  '/daos/lookup',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
      const ids = raw
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean);
      const rows = await getDaoCatalogRowsByIds(ids);
      res.json({
        success: true,
        daos: rows.map((row) => ({
          daoAccountId: row.daoAccountId,
          name: row.name,
          purpose: row.purpose,
          metadata: row.metadata,
          source: row.source,
          listedAt: row.listedAt,
          hasOnSocialProfile: row.hasOnSocialProfile,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
    }
  }
);

router.get('/my-daos', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = readAccountId(req.query.accountId);
    const [daos, indexedDaoAccountIds] = await Promise.all([
      listMyDaoMemberships(accountId),
      listIndexedDaoAccountIds(),
    ]);

    res.json({
      success: true,
      accountId,
      daos: daos.map((row) => ({
        daoAccountId: row.daoAccountId,
        roleNames: row.roleNames,
        updatedAt: row.updatedAt,
        name: row.name,
        purpose: row.purpose,
        metadata: row.metadata,
      })),
      indexedDaoAccountIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

router.get(
  '/proposal-policy-snapshot',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const proposalId = readProposalId(req.query.proposalId);
      if (proposalId === null) {
        res.status(400).json({
          success: false,
          error: 'A valid proposalId query parameter is required',
        });
        return;
      }

      const daoAccountId = readDaoAccountId(req.query.daoAccountId);
      const persisted = await loadPersistedPolicySnapshot(
        daoAccountId,
        proposalId
      );

      res.json({
        success: true,
        daoAccountId,
        proposalId,
        policy_snapshot: persisted?.policySnapshot ?? null,
        submission_block_height: persisted?.submissionBlockHeight ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
    }
  }
);

export default router;
