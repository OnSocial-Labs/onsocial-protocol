import {
  discoverFaceSearchOptions,
  parseDiscoverFaceFilter,
  type DiscoverFaceFilter,
  type PageMoodId,
  type ProfileKind,
} from '@onsocial/sdk';
import {
  discoverProfileToProfileListAccount as toProfileListAccount,
  profileListAccountToStandingSummary,
} from '@/lib/profile-list-account';

export interface DiscoverProfileSummary {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  kind?: ProfileKind | null;
  industry?: string | null;
  openJobsCount?: number;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  moodId: PageMoodId;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  targetEndorsedViewer: boolean;
  viewerEndorsed: boolean;
  /** Present when the viewer stands with this profile. */
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
}

export interface DiscoverProfilesResponse {
  query: string;
  face: DiscoverFaceFilter;
  industry: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  profiles: DiscoverProfileSummary[];
}

export interface DiscoverProfileFilters {
  face?: DiscoverFaceFilter;
  industry?: string;
}

export function parseDiscoverProfileFilters(params: {
  face?: string | null;
  industry?: string | null;
}): DiscoverProfileFilters {
  const face = parseDiscoverFaceFilter(params.face);
  const industry =
    face === 'people' ? '' : (params.industry ?? '').trim().slice(0, 64);
  return {
    face,
    ...(industry ? { industry } : {}),
  };
}

export function applyDiscoverFilterParams(
  params: URLSearchParams,
  face: DiscoverFaceFilter,
  industry = ''
): void {
  if (face === 'all') params.delete('face');
  else params.set('face', face);
  const sector = face === 'people' ? '' : industry.trim();
  if (sector) params.set('industry', sector);
  else params.delete('industry');
}

export function discoverSearchOptionsFromFilters(
  filters: DiscoverProfileFilters = {}
) {
  return discoverFaceSearchOptions(filters.face ?? 'all', filters.industry);
}

export const DISCOVER_PAGE_SIZE = 24;

export async function fetchDiscoverProfiles(
  query: string,
  viewerAccountId: string | null,
  offset = 0,
  signal?: AbortSignal,
  filters: DiscoverProfileFilters = {}
): Promise<DiscoverProfilesResponse> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  if (viewerAccountId) {
    params.set('viewerAccountId', viewerAccountId);
  }
  applyDiscoverFilterParams(
    params,
    filters.face ?? 'all',
    filters.industry ?? ''
  );
  params.set('limit', String(DISCOVER_PAGE_SIZE));
  params.set('offset', String(offset));

  const response = await fetch(`/api/discover?${params.toString()}`, {
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || `Discover failed (${response.status})`);
  }

  return (await response.json()) as DiscoverProfilesResponse;
}

export { toProfileListAccount as discoverProfileToProfileListAccount };

/** @deprecated Use {@link discoverProfileToProfileListAccount}. */
export function discoverProfileToStandingSummary(
  profile: DiscoverProfileSummary
) {
  return profileListAccountToStandingSummary(toProfileListAccount(profile));
}
