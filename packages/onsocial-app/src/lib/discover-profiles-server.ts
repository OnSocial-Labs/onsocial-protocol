import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';

const DEFAULT_LIMIT = 24;

export async function loadDiscoverProfilesPage(
  query: string,
  viewerAccountId: string | null,
  offset = 0,
  limit = DEFAULT_LIMIT
): Promise<DiscoverProfilesResponse> {
  const os = createServerOnSocialClient();
  const page = await os.query.profiles.discoverPage({
    query: query.trim() || undefined,
    limit,
    offset,
    viewerAccountId: viewerAccountId ?? undefined,
  });

  return mapDiscoverPageToResponse(os, page, query, limit, offset);
}
