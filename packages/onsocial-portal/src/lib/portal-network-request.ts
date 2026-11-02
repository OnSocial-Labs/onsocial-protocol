import 'server-only';

import { cookies } from 'next/headers';

import {
  PORTAL_NETWORK_COOKIE,
  resolvePortalNetwork,
  type PortalNearNetwork,
} from '@/lib/portal-network';

/** Network for this request. Cookie wins; otherwise the deployment default. */
export async function getRequestPortalNetwork(): Promise<PortalNearNetwork> {
  const jar = await cookies();
  return resolvePortalNetwork(jar.get(PORTAL_NETWORK_COOKIE)?.value);
}
