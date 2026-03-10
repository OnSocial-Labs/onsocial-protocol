// ---------------------------------------------------------------------------
// Admin API routes — partner application + approval management
// ---------------------------------------------------------------------------
//
// Public (wallet-authenticated via portal):
//   POST /v1/admin/apply              — submit a partner application (pending)
//   GET  /v1/admin/status/:wallet     — check application status by wallet
//   POST /v1/admin/rotate-key/:wallet — rotate API key (wallet-authenticated)
//
// Admin-only (ADMIN_SECRET header):
//   GET    /v1/admin/applications          — list all applications
//   POST   /v1/admin/approve/:appId        — approve + issue API key
//   POST   /v1/admin/reject/:appId         — reject application
// ---------------------------------------------------------------------------

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { query } from '../db/index.js';
import { logger } from '../logger.js';

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

// ---------------------------------------------------------------------------
// Admin auth middleware
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-admin-secret']?.toString();
  if (!ADMIN_SECRET || !secret || secret !== ADMIN_SECRET) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function generateApiKey(): string {
  return `os_live_${randomBytes(32).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// POST /v1/admin/apply — partner submits application (creates pending entry)
// ---------------------------------------------------------------------------

interface ApplyBody {
  app_id?: string;
  label: string;
  description?: string;
  expected_users?: string;
  contact?: string;
  wallet_id?: string;
}

router.post('/apply', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ApplyBody;

  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
    res.status(400).json({ success: false, error: 'label is required' });
    return;
  }
  const label = body.label.trim();

  const app_id =
    body.app_id && typeof body.app_id === 'string' && body.app_id.trim()
      ? body.app_id.trim()
      : toSlug(label);

  if (!app_id || !/^[a-z0-9_]{3,64}$/.test(app_id)) {
    res.status(400).json({
      success: false,
      error:
        'app_id must be 3-64 characters, lowercase letters, numbers, and underscores only',
    });
    return;
  }

  if (label.length < 2 || label.length > 100) {
    res
      .status(400)
      .json({ success: false, error: 'label must be 2-100 characters' });
    return;
  }

  try {
    // Check if app_id already exists
    const existing = await query(
      `SELECT id, status FROM partner_keys WHERE app_id = $1`,
      [app_id]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as { status: string };
      res.status(409).json({
        success: false,
        error: `app_id already ${row.status}`,
        status: row.status,
      });
      return;
    }

    // Insert pending application (NULL api_key — NULLs don't conflict on UNIQUE)
    await query(
      `INSERT INTO partner_keys (api_key, app_id, label, status, wallet_id, description, expected_users, contact, active)
         VALUES (NULL, $1, $2, 'pending', $3, $4, $5, $6, false)`,
      [
        app_id,
        label,
        body.wallet_id || null,
        body.description || '',
        body.expected_users || '',
        body.contact || '',
      ]
    );

    logger.info(
      { appId: app_id, label, wallet: body.wallet_id },
      'Partner application submitted'
    );

    res.json({
      success: true,
      app_id,
      label,
      status: 'pending',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ appId: app_id, error: msg }, 'Partner application failed');
    res.status(500).json({ success: false, error: 'Application failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/status/:wallet — check application status by wallet address
// ---------------------------------------------------------------------------

router.get(
  '/status/:wallet',
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;

    try {
      const result = await query(
        `SELECT app_id, label, status, api_key, created_at FROM partner_keys
         WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [wallet]
      );

      if (result.rows.length === 0) {
        res.json({ success: true, status: 'none' });
        return;
      }

      const row = result.rows[0] as {
        app_id: string;
        label: string;
        status: string;
        api_key: string;
        created_at: string;
      };

      res.json({
        success: true,
        app_id: row.app_id,
        label: row.label,
        status: row.status,
        // Only reveal API key if approved
        api_key: row.status === 'approved' ? row.api_key : undefined,
        applied_at: row.created_at,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/admin/applications — list all applications (admin only)
// ---------------------------------------------------------------------------

router.get(
  '/applications',
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await query(
        `SELECT app_id, label, status, wallet_id, description, expected_users, contact, admin_notes, created_at, reviewed_at
         FROM partner_keys ORDER BY created_at DESC`
      );
      res.json({ success: true, applications: result.rows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/admin/approve/:appId — approve application + issue API key
// ---------------------------------------------------------------------------

router.post(
  '/approve/:appId',
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { appId } = req.params;
    const { admin_notes } = (req.body ?? {}) as { admin_notes?: string };

    try {
      const existing = await query(
        `SELECT id, status FROM partner_keys WHERE app_id = $1`,
        [appId]
      );
      if (existing.rows.length === 0) {
        res
          .status(404)
          .json({ success: false, error: 'Application not found' });
        return;
      }

      const apiKey = generateApiKey();

      await query(
        `UPDATE partner_keys
         SET status = 'approved', api_key = $1, active = true, admin_notes = $2, reviewed_at = now()
         WHERE app_id = $3`,
        [apiKey, admin_notes || '', appId]
      );

      logger.info({ appId }, 'Partner approved');

      res.json({
        success: true,
        app_id: appId,
        api_key: apiKey,
        status: 'approved',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/admin/reject/:appId — reject application
// ---------------------------------------------------------------------------

router.post(
  '/reject/:appId',
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { appId } = req.params;
    const { admin_notes } = (req.body ?? {}) as { admin_notes?: string };

    try {
      await query(
        `UPDATE partner_keys
         SET status = 'rejected', admin_notes = $1, reviewed_at = now()
         WHERE app_id = $2`,
        [admin_notes || '', appId]
      );

      logger.info({ appId }, 'Partner rejected');

      res.json({ success: true, app_id: appId, status: 'rejected' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/admin/rotate-key/:wallet — rotate API key (wallet-authenticated)
// ---------------------------------------------------------------------------
// The partner portal calls this when the user clicks "Rotate Key".
// Requires the current API key in the X-Api-Key header as proof of ownership.
// ---------------------------------------------------------------------------

router.post(
  '/rotate-key/:wallet',
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;
    const currentKey = req.headers['x-api-key']?.toString();

    if (!wallet) {
      res.status(400).json({ success: false, error: 'wallet is required' });
      return;
    }

    if (!currentKey) {
      res.status(401).json({ success: false, error: 'X-Api-Key header required' });
      return;
    }

    try {
      // Fetch the approved row for this wallet
      const result = await query(
        `SELECT id, app_id, api_key FROM partner_keys
         WHERE wallet_id = $1 AND status = 'approved' AND active = true
         ORDER BY created_at DESC LIMIT 1`,
        [wallet]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'No active partner found for this wallet' });
        return;
      }

      const row = result.rows[0] as { id: number; app_id: string; api_key: string };

      // Constant-time comparison of current key
      const storedBuf = Buffer.from(row.api_key);
      const providedBuf = Buffer.from(currentKey);
      if (storedBuf.length !== providedBuf.length || !timingSafeEqual(storedBuf, providedBuf)) {
        res.status(403).json({ success: false, error: 'Invalid API key' });
        return;
      }

      // Generate new key and update
      const newKey = generateApiKey();
      await query(
        `UPDATE partner_keys SET api_key = $1 WHERE id = $2`,
        [newKey, row.id]
      );

      logger.info({ appId: row.app_id, wallet }, 'Partner API key rotated');

      res.json({
        success: true,
        app_id: row.app_id,
        api_key: newKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ wallet, error: msg }, 'Key rotation failed');
      res.status(500).json({ success: false, error: 'Key rotation failed' });
    }
  }
);

// ---------------------------------------------------------------------------
// Legacy: POST /v1/admin/register — kept for backward compat (self-service)
// ---------------------------------------------------------------------------

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { app_id?: string; label?: string };

  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
    res.status(400).json({ success: false, error: 'label is required' });
    return;
  }
  const label = body.label.trim();
  const app_id =
    body.app_id && typeof body.app_id === 'string' && body.app_id.trim()
      ? body.app_id.trim()
      : toSlug(label);

  if (!app_id || !/^[a-z0-9_]{3,64}$/.test(app_id)) {
    res.status(400).json({
      success: false,
      error: 'app_id must be 3-64 characters',
    });
    return;
  }

  try {
    const existing = await query(
      `SELECT id FROM partner_keys WHERE app_id = $1`,
      [app_id]
    );
    if (existing.rows.length > 0) {
      res
        .status(409)
        .json({ success: false, error: 'app_id already registered' });
      return;
    }

    const apiKey = generateApiKey();
    await query(
      `INSERT INTO partner_keys (api_key, app_id, label, status, active) VALUES ($1, $2, $3, 'approved', true)`,
      [apiKey, app_id, label]
    );

    logger.info({ appId: app_id, label }, 'Partner registered (legacy)');
    res.json({ success: true, app_id, api_key: apiKey, label });
  } catch (err) {
    logger.error({ err }, 'Legacy registration failed');
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

export default router;
