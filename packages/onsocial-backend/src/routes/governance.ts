import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getGovernanceFeedApplications,
  parseGovernanceFeedScope,
} from '../services/governance-feed.js';

const router = Router();

router.get('/feed', async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = parseGovernanceFeedScope(req.query.scope);
    const applications = await getGovernanceFeedApplications(scope);

    res.json({
      success: true,
      scope,
      applications,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
