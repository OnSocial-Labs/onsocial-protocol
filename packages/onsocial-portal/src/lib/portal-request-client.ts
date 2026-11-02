import 'server-only';

import type { PortalOnSocialConfig } from '@/lib/onsocial-client';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';

/** Server SDK client for the visitor's selected network. */
export async function createRequestOnSocialClient(
  config: PortalOnSocialConfig = {}
) {
  const network = config.network ?? (await getRequestPortalNetwork());
  return createPortalServerOnSocialClient({ ...config, network });
}
