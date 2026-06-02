import type {
  ProfileDiscoverPageResult,
  ProfileDiscoverStandingRow,
  ProfileDiscoverViewerContext,
} from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export type DiscoverStandingRow = ProfileDiscoverStandingRow;
export type DiscoverViewerContext = ProfileDiscoverViewerContext;

/** One SDK gateway round-trip (search, or batched search + viewer graph). */
export async function loadDiscoverIndexPage(
  query: string,
  limit: number,
  offset: number,
  viewerAccountId: string | null
): Promise<ProfileDiscoverPageResult> {
  const os = createPortalServerOnSocialClient();
  return os.query.profiles.discoverPage({
    query,
    limit,
    offset,
    ...(viewerAccountId ? { viewerAccountId } : {}),
  });
}
