/**
 * Compose routes: Set — store content at any core contract path.
 *
 * POST /set          — Upload + relay via intent auth
 * POST /prepare/set  — Upload only, return action for SDK signing
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import {
  composeSet,
  buildSetAction,
  ComposeError,
} from '../../services/compose/index.js';
import { collectFiles } from './helpers.js';

export const setRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

// ---------------------------------------------------------------------------
// POST /compose/set — Store content at any path with optional file uploads
//
// Supports two modes:
//   1. multipart/form-data — with file uploads
//      Fields: path (required), value (JSON string), mediaField (optional)
//      Files: any field name → uploaded to Lighthouse, CID injected into value
//
//   2. application/json — no file uploads
//      Body: { path, value, mediaField?, targetAccount? }
//
// Examples:
//   // Post with image
//   FormData: path="post/main", value='{"text":"Hello"}', mediaField="image", image=<file>
//
//   // Group content
//   FormData: path="groups/dao/media/photo1", value='{"caption":"Meeting"}', media=<file>
//
//   // Profile update (no file)
//   JSON: { "path": "profile/bio", "value": {"text": "Developer"} }
//
//   // Multi-file upload
//   FormData: path="post/gallery", value='{"title":"Vacation"}', photo1=<f>, photo2=<f>
//
//   // Custom app data — any path you invent
//   JSON: { "path": "app/recipes/pasta/carbonara", "value": {"ingredients": [...]} }
// ---------------------------------------------------------------------------
setRouter.post('/set', upload.any(), async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;

  try {
    const path = req.body.path;
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'Missing required field: path' });
      return;
    }

    // Value can be a JSON string (multipart) or object (JSON body)
    let value: Record<string, unknown>;
    if (typeof req.body.value === 'string') {
      try {
        value = JSON.parse(req.body.value);
      } catch {
        res.status(400).json({ error: 'Invalid JSON in value field' });
        return;
      }
    } else if (typeof req.body.value === 'object' && req.body.value !== null) {
      value = req.body.value;
    } else {
      value = {};
    }

    const mediaField = req.body.mediaField || undefined;
    const targetAccount = req.body.targetAccount || undefined;

    const files = collectFiles(
      req.files as Express.Multer.File[] | undefined
    );

    const result = await composeSet(
      accountId,
      { path, value, mediaField, targetAccount },
      files
    );

    res.status(201).json({
      txHash: result.txHash,
      path: result.path,
      uploads: Object.fromEntries(
        Object.entries(result.uploads).map(([k, v]) => [
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
    logger.error({ error, accountId }, 'Compose set failed');
    res.status(500).json({ error: 'Compose set failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /compose/prepare/set — Build action without relaying (for SDK signing)
//
// Same input as /compose/set. Uploads files to Lighthouse and returns the
// built action + target_account so the SDK can sign with the user's key
// and relay via POST /relay/signed (signed_payload auth).
//
// Response:
//   {
//     action:        { type: "set", data: {...} },
//     target_account: "alice.testnet",
//     uploads:       { image: { cid, url, size, hash } }
//   }
// ---------------------------------------------------------------------------
setRouter.post(
  '/prepare/set',
  upload.any(),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;

    try {
      const path = req.body.path;
      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'Missing required field: path' });
        return;
      }

      let value: Record<string, unknown>;
      if (typeof req.body.value === 'string') {
        try {
          value = JSON.parse(req.body.value);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in value field' });
          return;
        }
      } else if (
        typeof req.body.value === 'object' &&
        req.body.value !== null
      ) {
        value = req.body.value;
      } else {
        value = {};
      }

      const mediaField = req.body.mediaField || undefined;
      const targetAccount = req.body.targetAccount || undefined;

      const files = collectFiles(
        req.files as Express.Multer.File[] | undefined
      );

      const built = await buildSetAction(
        accountId,
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
