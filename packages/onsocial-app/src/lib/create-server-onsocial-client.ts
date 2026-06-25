import { OnSocial } from '@onsocial/sdk';
import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  fetch(input, { ...init, cache: init?.cache ?? 'no-store' });

export function getServerApiKey(): string | undefined {
  return process.env.ONSOCIAL_API_KEY?.trim() || undefined;
}

/**
 * Server-only OnSocial client authenticated with the gateway API key.
 * Required for indexed reads (`/graph/query`): profile shell, standing,
 * endorsements, discover, feed.
 */
export function createServerOnSocialClient(): OnSocial {
  const apiKey = getServerApiKey();
  if (!apiKey) {
    throw new Error(
      'ONSOCIAL_API_KEY is not set; cannot create a server-side OnSocial client'
    );
  }

  return new OnSocial({
    network: ACTIVE_NEAR_NETWORK,
    gatewayUrl: ACTIVE_API_URL,
    apiKey,
    fetch: noStoreFetch,
  });
}
