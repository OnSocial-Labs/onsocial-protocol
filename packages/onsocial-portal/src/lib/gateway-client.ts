import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

/**
 * Execute a GraphQL query via the gateway's /graph/query endpoint,
 * authenticated with a service-tier API key.
 *
 * This is the same path external developers use — the portal dogfoods its own API.
 */
export async function gatewayQuery<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const os = createPortalServerOnSocialClient();
  const body = await os.query.graphql<T>({ query, variables });

  if (body.errors) {
    throw new Error(
      `GraphQL error: ${body.errors
        .map((e: { message: string }) => e.message)
        .join(', ')}`
    );
  }

  return (body.data ?? {}) as T;
}
