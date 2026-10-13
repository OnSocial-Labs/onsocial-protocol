import type {
  DiscoverProfileFilters,
  DiscoverProfilesResponse,
} from '@/lib/discover-profiles';
import { discoverSearchOptionsFromFilters } from '@/lib/discover-profiles';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { loadHiringDiscoverPage } from '@/lib/discover-hiring';
import { loadOffersDiscoverPage } from '@/lib/discover-offers';
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
  const craft = filters.craft?.trim() ?? '';
  const needle = query.trim();

  if (face === 'offers' && needle) {
    try {
      const offers = await loadOffersDiscoverPage(os, {
        query: needle,
        viewerAccountId,
        offset,
        limit,
      });
      const mapped = await mapDiscoverPageToResponse(
        os,
        offers,
        query,
        limit,
        offset
      );
      return { ...mapped, face, industry, craft, hasMore: offers.hasMore };
    } catch {
      // Fall through to profile discover if the offers index is unavailable.
    }
  }

  if (face === 'hiring' && needle) {
    try {
      const hiring = await loadHiringDiscoverPage(os, {
        query: needle,
        industry,
        viewerAccountId,
        offset,
        limit,
      });
      const mapped = await mapDiscoverPageToResponse(
        os,
        hiring,
        query,
        limit,
        offset
      );
      return { ...mapped, face, industry, craft, hasMore: hiring.hasMore };
    } catch {
      // Fall through to profile discover if the jobs index is unavailable.
    }
  }

  const page = await os.query.profiles.discoverPage({
    query: needle || undefined,
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
  return { ...mapped, face, industry, craft };
}
