import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import type { PortalOnSocialConfig } from '@/lib/onsocial-client';

const SERVER_ONAPI_ENV_NAMES = ['ONSOCIAL_API_KEY', 'GATEWAY_SERVICE_KEY'];

const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  fetch(input, { ...init, cache: init?.cache ?? 'no-store' });

export function getServerOnApiKey(): string | undefined {
  return process.env.ONSOCIAL_API_KEY ?? process.env.GATEWAY_SERVICE_KEY;
}

export function createPortalServerOnSocialClient(
  config: PortalOnSocialConfig = {}
) {
  const apiKey = config.apiKey ?? getServerOnApiKey();

  if (!apiKey) {
    throw new Error(
      `${SERVER_ONAPI_ENV_NAMES.join(' or ')} is not set; portal cannot create a server-side OnSocial SDK client`
    );
  }

  return createPortalOnSocialClient({
    ...config,
    apiKey,
    fetch: config.fetch ?? noStoreFetch,
  });
}
