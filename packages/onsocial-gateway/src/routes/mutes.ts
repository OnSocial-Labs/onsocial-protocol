import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import {
  addMute,
  listMutes,
  removeMute,
} from '../services/mutes/index.js';

export const muteRouter = Router();

muteRouter.use('/mutes', requireAuth);

muteRouter.get('/mutes', async (req: Request, res: Response) => {
  try {
    const mutes = await listMutes(req.auth!.accountId);
    res.json({ mutes });
  } catch (error) {
    req.log.error({ error }, 'Failed to list mutes');
    res.status(500).json({ error: 'Failed to list mutes' });
  }
});

muteRouter.post('/mutes', async (req: Request, res: Response) => {
  const mutedAccountId = String(req.body?.mutedAccountId ?? '').trim();
  if (!mutedAccountId) {
    res.status(400).json({ error: 'mutedAccountId is required' });
    return;
  }

  try {
    const result = await addMute(req.auth!.accountId, mutedAccountId);
    if ('code' in result) {
      const status =
        result.code === 'SELF_MUTE' || result.code === 'INVALID_ACCOUNT'
          ? 400
          : 404;
      res.status(status).json({ error: result.message, code: result.code });
      return;
    }
    res.status(201).json({ mute: result });
  } catch (error) {
    req.log.error({ error }, 'Failed to add mute');
    res.status(500).json({ error: 'Failed to add mute' });
  }
});

muteRouter.delete(
  '/mutes/:mutedAccountId',
  async (req: Request, res: Response) => {
    const mutedAccountId = String(req.params.mutedAccountId ?? '').trim();
    if (!mutedAccountId) {
      res.status(400).json({ error: 'mutedAccountId is required' });
      return;
    }

    try {
      const result = await removeMute(req.auth!.accountId, mutedAccountId);
      if (result !== true) {
        const status = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: result.message, code: result.code });
        return;
      }
      res.json({ status: 'ok' });
    } catch (error) {
      req.log.error({ error }, 'Failed to remove mute');
      res.status(500).json({ error: 'Failed to remove mute' });
    }
  }
);
