/**
 * Compose route helpers — shared parsing utilities for multipart fields
 * and a DRY action-handler factory for simple (non-upload) endpoints.
 */

import type { Request, Response } from 'express';
import type { UploadedFile } from '../../services/compose/index.js';
import type { SimpleActionResult } from '../../services/compose/shared.js';
import {
  ComposeError,
  relayExecute,
  intentAuth,
  extractTxHash,
  logger,
} from '../../services/compose/shared.js';

// ---------------------------------------------------------------------------
// DRY action-handler factory
// ---------------------------------------------------------------------------

type BuildFn = (body: Record<string, unknown>) => SimpleActionResult;

/**
 * Create relay + prepare handlers for a simple (non-upload) compose action.
 *
 * - **relay**: Builds the action, relays via intent auth, returns `{ txHash }`.
 * - **prepare**: Builds the action, returns `{ action, target_account }` for SDK signing.
 */
export function actionHandlers(buildFn: BuildFn, label: string) {
  const relay = async (req: Request, res: Response): Promise<void> => {
    const accountId = req.auth!.accountId;
    try {
      const built = buildFn(req.body as Record<string, unknown>);
      const result = await relayExecute(
        intentAuth(accountId),
        built.action,
        built.targetAccount
      );
      if (!result.ok) throw new ComposeError(result.status, result.data);
      res.status(200).json({ txHash: extractTxHash(result.data) });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error({ error, accountId }, `Compose ${label} failed`);
      res.status(500).json({ error: `Compose ${label} failed` });
    }
  };

  const prepare = async (req: Request, res: Response): Promise<void> => {
    try {
      const built = buildFn(req.body as Record<string, unknown>);
      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        `Compose prepare/${label} failed`
      );
      res.status(500).json({ error: `Compose prepare/${label} failed` });
    }
  };

  return { relay, prepare };
}

/** Parse a JSON string or passthrough an object. Returns undefined on bad input. */
export function parseJsonField<T = Record<string, unknown>>(
  value: unknown
): T | undefined {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'object' && value !== null) {
    return value as T;
  }
  return undefined;
}

/** Parse a boolean from multipart form data (string "true"/"false" or actual boolean). */
export function parseBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/** Extract an UploadedFile from an Express multer `req.file`. */
export function extractImageFile(
  file: Express.Multer.File | undefined
): UploadedFile | undefined {
  if (!file) return undefined;
  return {
    fieldname: file.fieldname,
    originalname: file.originalname,
    buffer: file.buffer,
    mimetype: file.mimetype,
    size: file.size,
  };
}

/** Collect UploadedFile[] from Express multer `req.files`. */
export function collectFiles(
  files: Express.Multer.File[] | undefined
): UploadedFile[] {
  if (!files || !Array.isArray(files)) return [];
  return files.map((f) => ({
    fieldname: f.fieldname,
    originalname: f.originalname,
    buffer: f.buffer,
    mimetype: f.mimetype,
    size: f.size,
  }));
}
