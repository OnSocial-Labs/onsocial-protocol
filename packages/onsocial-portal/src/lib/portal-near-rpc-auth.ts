import 'server-only';

import { isNearRpcBffAuthorized } from '@onsocial/rpc';

import { PUBLIC_APP_URL } from '@/lib/portal-config';

let cachedOrigins: ReadonlySet<string> | null = null;

function addOrigin(
  origins: Set<string>,
  value: string | undefined | null
): void {
  if (!value?.trim()) return;
  try {
    const normalized = new URL(value.trim()).origin;
    origins.add(normalized);
  } catch {
    const trimmed = value.trim().replace(/\/$/, '');
    if (trimmed) origins.add(trimmed);
  }
}

export function getPortalNearRpcAllowedOrigins(): ReadonlySet<string> {
  if (cachedOrigins) return cachedOrigins;

  const origins = new Set<string>();
  addOrigin(origins, PUBLIC_APP_URL);
  addOrigin(origins, process.env.NEXT_PUBLIC_APP_URL);
  addOrigin(origins, process.env.PORTAL_INTERNAL_RPC_ORIGIN);
  addOrigin(origins, process.env.INTERNAL_RPC_ORIGIN);

  if (process.env.VERCEL_URL) {
    const vercel = process.env.VERCEL_URL.trim();
    addOrigin(
      origins,
      vercel.startsWith('http') ? vercel : `https://${vercel}`
    );
  }

  for (const host of [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://onsocial.id',
    'https://portal.onsocial.id',
    'https://mainnet.onsocial.id',
    'https://testnet.onsocial.id',
  ]) {
    origins.add(host);
  }

  cachedOrigins = origins;
  return cachedOrigins;
}

export function isPortalNearRpcRequestAuthorized(request: Request): boolean {
  return isNearRpcBffAuthorized(request.headers, {
    allowedOrigins: getPortalNearRpcAllowedOrigins(),
    internalSecret: process.env.PORTAL_INTERNAL_RPC_SECRET,
  });
}
