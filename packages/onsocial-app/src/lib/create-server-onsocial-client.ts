import { OnSocial } from '@onsocial/sdk';
import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  E2E_GRAPH_COOKIE,
  e2eGraphStubsAllowed,
  extractGraphQuery,
  isGraphQueryRequest,
  resolveE2eGraphStub,
} from '@/lib/e2e-graph-stubs';

async function e2eGraphCookieValue(): Promise<string | undefined> {
  try {
    const { cookies } = await import('next/headers');
    return (await cookies()).get(E2E_GRAPH_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

const noStoreFetch: typeof globalThis.fetch = async (input, init) => {
  if (e2eGraphStubsAllowed() && isGraphQueryRequest(input, init)) {
    const stub = resolveE2eGraphStub({
      query: extractGraphQuery(init?.body),
      cookieValue: await e2eGraphCookieValue(),
    });
    if (stub) {
      return new Response(JSON.stringify(stub), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
      });
    }
  }
  return fetch(input, { ...init, cache: init?.cache ?? 'no-store' });
};

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
