import type {
  DiscoverProfileFilters,
  DiscoverProfilesResponse,
} from '@/lib/discover-profiles';
import { discoverSearchOptionsFromFilters } from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { mapDiscoverPageToResponse } from '@/lib/discover-profiles-server-map';

const DEFAULT_LIMIT = 24;

export async function loadDiscoverProfilesPage(
  query: string,
  viewerAccountId: string | null,
  offset = 0,
  limit = DEFAULT_LIMIT,
  filters: DiscoverProfileFilters = {}
): Promise<DiscoverProfilesResponse> {
  const os = createServerOnSocialClient();
  const face = filters.face ?? 'all';
  const industry = filters.industry?.trim() ?? '';
  const page = await os.query.profiles.discoverPage({
    query: query.trim() || undefined,
    limit,
    offset,
    viewerAccountId: viewerAccountId ?? undefined,
    ...discoverSearchOptionsFromFilters(filters),
  });

  const mapped = await mapDiscoverPageToResponse(
    os,
    page,
    query,
    limit,
    offset
  );
  return { ...mapped, face, industry };
}
