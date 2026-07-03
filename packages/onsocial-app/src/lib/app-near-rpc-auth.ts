import 'server-only';

import { isNearRpcBffAuthorized } from '@onsocial/rpc';

let cachedOrigins: ReadonlySet<string> | null = null;

function addOrigin(
  origins: Set<string>,
  value: string | undefined | null
): void {
  if (!value?.trim()) {
    return;
  }
  try {
    const normalized = new URL(value.trim()).origin;
    origins.add(normalized);
  } catch {
    const trimmed = value.trim().replace(/\/$/, '');
    if (trimmed) {
      origins.add(trimmed);
    }
  }
}

export function getAppNearRpcAllowedOrigins(): ReadonlySet<string> {
  if (cachedOrigins) {
    return cachedOrigins;
  }

  const origins = new Set<string>();
  addOrigin(origins, process.env.NEXT_PUBLIC_APP_URL);
  addOrigin(origins, process.env.INTERNAL_RPC_ORIGIN);

  if (process.env.VERCEL_URL) {
    const vercel = process.env.VERCEL_URL.trim();
    addOrigin(
      origins,
      vercel.startsWith('http') ? vercel : `https://${vercel}`
    );
  }

  for (const host of [
    'http://localhost:3060',
    'http://127.0.0.1:3060',
    'https://app.onsocial.id',
    'https://testnet.app.onsocial.id',
  ]) {
    origins.add(host);
  }

  cachedOrigins = origins;
  return cachedOrigins;
}

export function isAppNearRpcRequestAuthorized(request: Request): boolean {
  return isNearRpcBffAuthorized(request.headers, {
    allowedOrigins: getAppNearRpcAllowedOrigins(),
    internalSecret: process.env.INTERNAL_RPC_SECRET,
  });
}
