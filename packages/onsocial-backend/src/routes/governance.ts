import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import {
  getGovernanceFeedApplications,
  parseGovernanceFeedScope,
} from '../services/governance-feed.js';
import { loadPersistedPolicySnapshot } from '../services/governance-proposal-policy-store.js';

const router = Router();

function readProposalId(value: unknown): number | null {
  const proposalId =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  return proposalId;
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
    const { applications, daoPolicy } =
      await getGovernanceFeedApplications(scope);

    res.json({
      success: true,
      scope,
      applications,
      daoPolicy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
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
