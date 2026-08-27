import { randomBytes } from 'crypto';
import type { DeveloperAppRecord } from './developer-apps/index.js';
import { listingOrigin } from './developer-apps/listing.js';

const HANDOFF_TTL_MS = 90_000;

type StoredHandoff = {
  accountId: string;
  appId: string;
  origin: string;
  href: string;
  expiresAt: number;
};

const store = new Map<string, StoredHandoff>();

setInterval(() => {
  const now = Date.now();
  for (const [code, row] of store) {
    if (row.expiresAt < now) store.delete(code);
  }
}, 60_000).unref?.();

export function createAppHandoff(
  accountId: string,
  app: DeveloperAppRecord
):
  | { code: string; href: string; expiresIn: number }
  | { error: string; code: 'NOT_LISTED' } {
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
  store.set(code, {
    accountId,
    appId: app.appId,
    origin,
    href: app.href,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
  });
  return { code, href: app.href, expiresIn: HANDOFF_TTL_MS / 1000 };
}

export function consumeAppHandoff(
  code: string,
  appId: string,
  requestOrigin?: string | null
):
  | { accountId: string; appId: string }
  | { error: string; code: 'INVALID_HANDOFF' } {
  const row = store.get(code);
  if (!row) {
    return { error: 'Invalid or expired handoff', code: 'INVALID_HANDOFF' };
  }
  if (row.expiresAt < Date.now()) {
    store.delete(code);
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
  store.delete(code);
  return { accountId: row.accountId, appId: row.appId };
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
