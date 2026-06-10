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

router.get('/feed', async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = parseGovernanceFeedScope(req.query.scope);
    const daoAccountId = readDaoAccountId(req.query.daoAccountId);
    const { applications, daoPolicy } = await getGovernanceFeedApplications(
      scope,
      daoAccountId
    );

    res.json({
      success: true,
      scope,
      daoAccountId,
      applications,
      daoPolicy,
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
