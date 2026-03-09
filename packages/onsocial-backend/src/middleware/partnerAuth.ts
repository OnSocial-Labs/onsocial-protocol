// ---------------------------------------------------------------------------
// Partner API key authentication middleware
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { logger } from '../logger.js';
import { timingSafeEqual } from 'crypto';

/** Cached partner keys: api_key → app_id. Refreshed periodically. */
let keyCache = new Map<string, string>();
let lastRefresh = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function refreshCache(): Promise<void> {
  const { rows } = await query<{ api_key: string; app_id: string }>(
    `SELECT api_key, app_id FROM partner_keys WHERE active = true`
  );
  const fresh = new Map<string, string>();
  for (const row of rows) {
    fresh.set(row.api_key, row.app_id);
  }
  keyCache = fresh;
  lastRefresh = Date.now();
}

/** Constant-time string comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Look up app_id for a given API key. Returns null if invalid. */
function resolveKey(provided: string): string | null {
  for (const [key, appId] of keyCache) {
    if (safeCompare(provided, key)) return appId;
  }
  return null;
}

/**
 * Express middleware: validates partner API key from X-Api-Key or
 * Authorization: Bearer header. Sets req.partnerAppId on success.
 */
export async function partnerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Refresh cache if stale
  if (Date.now() - lastRefresh > CACHE_TTL_MS) {
    try {
      await refreshCache();
    } catch (err) {
      logger.error({ err }, 'Failed to refresh partner key cache');
      // Continue with stale cache rather than blocking
    }
  }

  // Extract key from header
  const provided =
    req.headers['x-api-key']?.toString() ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!provided) {
    res.status(401).json({ success: false, error: 'Missing API key' });
    return;
  }

  const appId = resolveKey(provided);
  if (!appId) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return;
  }

  // Attach partner identity to request
  (req as Request & { partnerAppId: string }).partnerAppId = appId;

  // Fire-and-forget: update last_used timestamp
  query(`UPDATE partner_keys SET last_used = now() WHERE app_id = $1`, [
    appId,
  ]).catch(() => {});

  next();
}

/** Pre-warm the key cache at startup. Non-fatal if table doesn't exist yet. */
export async function initPartnerKeyCache(): Promise<void> {
  try {
    await refreshCache();
    logger.info(
      { partnerKeys: keyCache.size },
      'Partner key cache initialized'
    );
  } catch (err) {
    logger.warn(
      { err },
      'Partner key cache init failed (table may not exist yet)'
    );
  }
}
