import 'server-only';

import { cookies } from 'next/headers';

import { ACTIVE_BACKEND_URL, governanceDaoAccount } from '@/lib/portal-config';
import {
  PORTAL_NETWORK_COOKIE,
  portalNetworkFromEnv,
  portalNetworkProfile,
  resolvePortalNetwork,
  type PortalNearNetwork,
} from '@/lib/portal-network';

/** Network for this request. Cookie wins; otherwise the deployment default. */
export async function getRequestPortalNetwork(): Promise<PortalNearNetwork> {
  try {
    const jar = await cookies();
    return resolvePortalNetwork(jar.get(PORTAL_NETWORK_COOKIE)?.value);
  } catch {
    return resolvePortalNetwork(null);
  }
}

const DAO_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** Explicit dao query, otherwise the DAO for this request's network. */
export async function resolveRequestDaoAccount(
  explicit: string | null | undefined
): Promise<string> {
  const daoAccountId =
    explicit?.trim() || governanceDaoAccount(await getRequestPortalNetwork());
  if (!DAO_ACCOUNT_PATTERN.test(daoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }
  return daoAccountId;
}

/** Backend for this request. Build env stays on the deployment backend. */
export async function getRequestBackendUrl(): Promise<string> {
  const network = await getRequestPortalNetwork();
  if (network === portalNetworkFromEnv()) {
    return (process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL).replace(/\/$/, '');
  }
  return portalNetworkProfile(network).backendUrl;
}
