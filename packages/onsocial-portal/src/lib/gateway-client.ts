import { ACTIVE_API_URL } from '@/lib/portal-config';

const GATEWAY_URL = `${ACTIVE_API_URL.replace(/\/$/, '')}/graph/query`;

const GATEWAY_API_KEY = process.env.GATEWAY_SERVICE_KEY ?? '';

/**
 * Execute a GraphQL query via the gateway's /graph/query endpoint,
 * authenticated with a service-tier API key.
 *
 * This is the same path external developers use — the portal dogfoods its own API.
 */
export async function gatewayQuery<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (!GATEWAY_API_KEY) {
    throw new Error(
      'GATEWAY_SERVICE_KEY is not set — portal cannot query the gateway',
    );
  }

  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': GATEWAY_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Gateway returned ${res.status}`);
  }

  const body = await res.json();

  if (body.errors) {
    throw new Error(
      `GraphQL error: ${body.errors.map((e: { message: string }) => e.message).join(', ')}`,
    );
  }

  return body.data as T;
}
