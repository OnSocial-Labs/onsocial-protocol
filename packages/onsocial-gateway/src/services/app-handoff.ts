import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import type { DeveloperAppRecord } from './developer-apps/index.js';
import { listingOrigin } from './developer-apps/listing.js';
import { logger } from '../logger.js';

const HANDOFF_TTL_MS = 90_000;

type StoredHandoff = {
  accountId: string;
  appId: string;
  origin: string;
  href: string;
  expiresAt: number;
};

const memory = new Map<string, StoredHandoff>();

const databaseUrl = process.env.DATABASE_URL ?? '';
const pool =
  databaseUrl && process.env.VITEST !== 'true'
    ? new Pool({ connectionString: databaseUrl })
    : null;

if (pool) {
  logger.info('App handoff store: PostgreSQL');
} else {
  logger.info('App handoff store: in-memory');
}

setInterval(() => {
  void purgeExpiredHandoffs();
}, 60_000).unref?.();

async function purgeExpiredHandoffs(): Promise<void> {
  const now = Date.now();
  for (const [code, row] of memory) {
    if (row.expiresAt < now) memory.delete(code);
  }
  if (!pool) return;
  try {
    await pool.query('DELETE FROM app_handoff_codes WHERE expires_at < now()');
  } catch (error) {
    logger.warn({ error }, 'Failed to purge expired app handoff codes');
  }
}

export async function createAppHandoff(
  accountId: string,
  app: DeveloperAppRecord
): Promise<
  | { code: string; href: string; expiresIn: number }
  | { error: string; code: 'NOT_LISTED' }
> {
  if (!app.listed || !app.href) {
    return {
      error: 'App is not listed on the Community board',
      code: 'NOT_LISTED',
    };
  }
  const origin = listingOrigin(app.href);
  if (!origin) {
    return {
      error: 'App is not listed on the Community board',
      code: 'NOT_LISTED',
    };
  }

  const code = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + HANDOFF_TTL_MS;
  const row: StoredHandoff = {
    accountId,
    appId: app.appId,
    origin,
    href: app.href,
    expiresAt,
  };

  if (pool) {
    await pool.query(
      `INSERT INTO app_handoff_codes
         (code, account_id, app_id, origin, href, expires_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000))`,
      [code, row.accountId, row.appId, row.origin, row.href, row.expiresAt]
    );
  } else {
    memory.set(code, row);
  }

  return { code, href: app.href, expiresIn: HANDOFF_TTL_MS / 1000 };
}

export async function consumeAppHandoff(
  code: string,
  appId: string,
  requestOrigin?: string | null
): Promise<
  | { accountId: string; appId: string }
  | { error: string; code: 'INVALID_HANDOFF' }
> {
  const row = await takeHandoffRow(code);
  if (!row) {
    return { error: 'Invalid or expired handoff', code: 'INVALID_HANDOFF' };
  }
  if (row.expiresAt < Date.now()) {
    return { error: 'Invalid or expired handoff', code: 'INVALID_HANDOFF' };
  }
  if (row.appId !== appId) {
    return { error: 'Invalid or expired handoff', code: 'INVALID_HANDOFF' };
  }
  if (requestOrigin && requestOrigin !== row.origin) {
    return {
      error: 'Handoff origin does not match listing',
      code: 'INVALID_HANDOFF',
    };
  }
  return { accountId: row.accountId, appId: row.appId };
}

async function takeHandoffRow(code: string): Promise<StoredHandoff | null> {
  if (pool) {
    const result = await pool.query<{
      account_id: string;
      app_id: string;
      origin: string;
      href: string;
      expires_at: Date;
    }>(
      `DELETE FROM app_handoff_codes
        WHERE code = $1
        RETURNING account_id, app_id, origin, href, expires_at`,
      [code]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      accountId: row.account_id,
      appId: row.app_id,
      origin: row.origin,
      href: row.href,
      expiresAt: row.expires_at.getTime(),
    };
  }

  const row = memory.get(code);
  if (!row) return null;
  memory.delete(code);
  return row;
}

export function listedOriginsFromApps(
  apps: Array<{ href: string | null }>
): Set<string> {
  const origins = new Set<string>();
  for (const app of apps) {
    if (!app.href) continue;
    const origin = listingOrigin(app.href);
    if (origin) origins.add(origin);
  }
  return origins;
}
