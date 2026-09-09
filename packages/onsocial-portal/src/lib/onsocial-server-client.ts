import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import type { PortalOnSocialConfig } from '@/lib/onsocial-client';
import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

/** Canonical server env (from GSM `ONSOCIAL_SERVICE_ONAPI_KEY`). */
const SERVER_ONAPI_ENV = 'ONSOCIAL_API_KEY';

const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  fetch(input, { ...init, cache: init?.cache ?? 'no-store' });

function isLocalGatewayUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

function publicNetworkGatewayUrl(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id';
}

/**
 * Gateway used for server-side profile/graph/OnAPI proxy reads.
 *
 * `dev:local-sandbox` points `NEXT_PUBLIC_API_URL` at a local Revolut sandbox
 * gateway (in-memory keys, empty/mismatched Hasura). Indexed social data still
 * lives on the public network gateway — override with PORTAL_DATA_GATEWAY_URL.
 */
export function resolveServerDataGatewayUrl(): string {
  const explicit = process.env.PORTAL_DATA_GATEWAY_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const apiUrl = ACTIVE_API_URL.replace(/\/$/, '');
  if (isLocalGatewayUrl(apiUrl)) {
    return publicNetworkGatewayUrl();
  }
  return apiUrl;
}

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
    gatewayUrl: config.gatewayUrl ?? resolveServerDataGatewayUrl(),
    apiKey,
    fetch: config.fetch ?? noStoreFetch,
  });
}
