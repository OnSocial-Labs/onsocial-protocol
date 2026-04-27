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
// Actor passthrough — resolves the effective actor identity.
// API-key users can specify actor_id for their end-user.
// JWT users are always locked to their own identity.
// ---------------------------------------------------------------------------

/**
 * Resolve the effective actor ID for intent auth.
 * API-key callers may pass `actor_id` in the body to act on behalf of an end-user.
 */
export function resolveActorId(req: Request): string {
  const accountId = req.auth!.accountId;
  return req.auth!.method === 'apikey' &&
    typeof req.body?.actor_id === 'string' &&
    req.body.actor_id
    ? req.body.actor_id
    : accountId;
}

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
    const effectiveActorId = resolveActorId(req);
    // wait=true tells the relayer to use broadcast_tx_commit and report the
    // on-chain outcome. We pass through { success, status, error } so the
    // SDK's RelayExecutionError detection fires on inner-action panics
    // instead of returning a misleadingly-truthy txHash.
    const wait = req.query.wait === 'true' || req.query.wait === '1';
    try {
      const built = buildFn(req.body as Record<string, unknown>);
      const result = await relayExecute(
        intentAuth(effectiveActorId),
        built.action,
        built.targetAccount,
        { wait }
      );
      if (!result.ok) throw new ComposeError(result.status, result.data);
      const data =
        typeof result.data === 'object' && result.data !== null
          ? (result.data as Record<string, unknown>)
          : {};
      const out: Record<string, unknown> = {
        txHash: extractTxHash(result.data),
      };
      if ('success' in data) out.success = data.success;
      if ('status' in data) out.status = data.status;
      if ('error' in data) out.error = data.error;
      res.status(200).json(out);
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
