import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import type { PortalOnSocialConfig } from '@/lib/onsocial-client';

/** Canonical server env (from GSM `ONSOCIAL_SERVICE_ONAPI_KEY`). */
const SERVER_ONAPI_ENV = 'ONSOCIAL_API_KEY';

const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  fetch(input, { ...init, cache: init?.cache ?? 'no-store' });

export function getServerOnApiKey(): string | undefined {
  const key = process.env[SERVER_ONAPI_ENV]?.trim();
  if (key) return key;

  const legacy = process.env.GATEWAY_SERVICE_KEY?.trim();
  if (legacy && process.env.NODE_ENV === 'development') {
    console.warn(
      '[portal] GATEWAY_SERVICE_KEY is deprecated; use ONSOCIAL_API_KEY (sync via scripts/sync-portal-env-from-gsm.sh).'
    );
  }
  return legacy;
}

export function createPortalServerOnSocialClient(
  config: PortalOnSocialConfig = {}
) {
  const apiKey = config.apiKey ?? getServerOnApiKey();

  if (!apiKey) {
    throw new Error(
      `${SERVER_ONAPI_ENV} is not set; portal cannot create a server-side OnSocial SDK client`
    );
  }

  return createPortalOnSocialClient({
    ...config,
    apiKey,
    fetch: config.fetch ?? noStoreFetch,
  });
}
