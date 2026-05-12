/**
 * Compose routes: Set — store content at any core contract path.
 *
 * POST /prepare/set  — Upload files + build action; SDK signs and posts /relay/delegate.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import { buildSetAction, ComposeError } from '../../services/compose/index.js';
import { collectFiles, resolveActorId } from './helpers.js';

export const setRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

setRouter.post(
  '/prepare/set',
  upload.any(),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const effectiveActorId = resolveActorId(req);

    try {
      const path = req.body.path;
      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'Missing required field: path' });
        return;
      }

      // Value can be a JSON string (multipart) or object (JSON body).
      // null is a valid tombstone — do NOT convert it to {}.
      let value: Record<string, unknown> | null;
      if (typeof req.body.value === 'string') {
        try {
          value = JSON.parse(req.body.value); // JSON.parse('null') → null preserved
        } catch {
          res.status(400).json({ error: 'Invalid JSON in value field' });
          return;
        }
      } else if (typeof req.body.value === 'object') {
        value = req.body.value; // null is typeof 'object' — pass through as tombstone
      } else {
        value = {};
      }

      const mediaField = req.body.mediaField || undefined;
      const targetAccount = req.body.targetAccount || undefined;

      const files = collectFiles(
        req.files as Express.Multer.File[] | undefined
      );

      const built = await buildSetAction(
        effectiveActorId,
        { path, value, mediaField, targetAccount },
        files
      );

      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
        uploads: Object.fromEntries(
          Object.entries(built.uploads).map(([k, v]) => [
            k,
            { cid: v.cid, url: v.url, size: v.size, hash: v.hash },
          ])
        ),
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error({ error, accountId }, 'Compose prepare/set failed');
      res.status(500).json({ error: 'Compose prepare/set failed' });
    }
  }
);
