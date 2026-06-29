import type { PageMoodId } from '@onsocial/sdk';
import {
  discoverProfileToProfileListAccount as toProfileListAccount,
  profileListAccountToStandingSummary,
} from '@/lib/profile-list-account';

export interface DiscoverProfileSummary {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  moodId: PageMoodId;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  targetEndorsedViewer: boolean;
  /** Present when the viewer stands with this profile. */
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
}

export interface DiscoverProfilesResponse {
  query: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  profiles: DiscoverProfileSummary[];
}

export const DISCOVER_PAGE_SIZE = 24;

export async function fetchDiscoverProfiles(
  query: string,
  viewerAccountId: string | null,
  offset = 0,
  signal?: AbortSignal
): Promise<DiscoverProfilesResponse> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  if (viewerAccountId) {
    params.set('viewerAccountId', viewerAccountId);
  }
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
