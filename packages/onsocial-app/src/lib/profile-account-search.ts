import type { OnSocial } from '@onsocial/sdk';

export const PROFILE_SEARCH_MAX_QUERY_LENGTH = 80;
export const PROFILE_SEARCH_MIN_QUERY_LENGTH = 2;
export const PROFILE_SEARCH_MATCH_LIMIT = 200;

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
  os: OnSocial,
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
