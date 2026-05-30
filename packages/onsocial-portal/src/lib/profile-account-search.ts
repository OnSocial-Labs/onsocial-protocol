import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export const PROFILE_SEARCH_MAX_QUERY_LENGTH = 80;
export const PROFILE_SEARCH_MIN_QUERY_LENGTH = 2;
export const PROFILE_SEARCH_MATCH_LIMIT = 200;

type PortalOnSocialClient = ReturnType<typeof createPortalServerOnSocialClient>;

export function normalizeProfileSearchQuery(
  query: string | null | undefined
): string {
  return (query ?? '').trim().slice(0, PROFILE_SEARCH_MAX_QUERY_LENGTH);
}

export function isProfileSearchQuery(
  query: string | null | undefined
): boolean {
  return (
    normalizeProfileSearchQuery(query).length >= PROFILE_SEARCH_MIN_QUERY_LENGTH
  );
}

export async function searchMatchingAccountIds(
  os: PortalOnSocialClient,
  query: string | null | undefined
): Promise<string[]> {
  const normalized = normalizeProfileSearchQuery(query);
  if (normalized.length < PROFILE_SEARCH_MIN_QUERY_LENGTH) return [];

  const rows = await os.query.profiles.search({
    query: normalized,
    limit: PROFILE_SEARCH_MATCH_LIMIT,
  });

  return rows.map((row) => row.accountId);
}
