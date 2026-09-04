import {
  PROFILE_INDUSTRY_MAX,
  discoverFaceSearchOptions,
  parseDiscoverFaceFilter,
  type DiscoverFaceFilter,
  type OnSocial,
  type PageMoodId,
  type ProfileDiscoverPageResult,
  type ProfileKind,
  type MaterialisedProfile,
} from '@onsocial/sdk';
import {
  discoverProfileToProfileListAccount as toProfileListAccount,
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';
import { PROFILE_EDITOR_MAX_TAG_LENGTH } from '@/lib/profile-tag-editor';

export const PROFILE_CRAFT_MAX = PROFILE_EDITOR_MAX_TAG_LENGTH;

export function normalizeDiscoverCraft(
  raw: string | null | undefined
): string {
  return (raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .slice(0, PROFILE_CRAFT_MAX);
}

/** People Discover filtered by About craft (`profile/tags`). */
export function discoverCraftPath(slug: string): string {
  const craft = normalizeDiscoverCraft(slug);
  const params = new URLSearchParams();
  params.set('face', 'people');
  if (craft) params.set('craft', craft);
  return `/discover?${params.toString()}`;
}

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
  craft: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  profiles: DiscoverProfileSummary[];
}

export interface DiscoverProfileFilters {
  face?: DiscoverFaceFilter;
  industry?: string;
  craft?: string;
}

export function parseDiscoverProfileFilters(params: {
  face?: string | null;
  industry?: string | null;
  craft?: string | null;
}): DiscoverProfileFilters {
  const craft = normalizeDiscoverCraft(params.craft);
  const face = craft
    ? 'people'
    : parseDiscoverFaceFilter(params.face);
  const industry =
    face === 'people'
      ? ''
      : (params.industry ?? '').trim().slice(0, PROFILE_INDUSTRY_MAX);
  return {
    face,
    ...(industry ? { industry } : {}),
    ...(craft ? { craft } : {}),
  };
}

export function applyDiscoverFilterParams(
  params: URLSearchParams,
  face: DiscoverFaceFilter,
  industry = '',
  craft = ''
): void {
  const craftTag = normalizeDiscoverCraft(craft);
  const nextFace = craftTag ? 'people' : face;
  if (nextFace === 'all') params.delete('face');
  else params.set('face', nextFace);
  const sector = nextFace === 'people' ? '' : industry.trim();
  if (sector) params.set('industry', sector);
  else params.delete('industry');
  if (craftTag) params.set('craft', craftTag);
  else params.delete('craft');
}

export function discoverSearchOptionsFromFilters(
  filters: DiscoverProfileFilters = {}
) {
  return discoverFaceSearchOptions(
    filters.face ?? 'all',
    filters.industry,
    filters.craft
  );
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
    filters.industry ?? '',
    filters.craft ?? ''
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

export function discoverPageToProfileListAccounts(
  os: OnSocial,
  page: ProfileDiscoverPageResult
): ProfileListAccount[] {
  const viewerOutgoingByTarget = new Map(
    (page.viewer?.outgoing ?? []).map((row) => [row.targetAccount, row])
  );
  const viewerIncomingSet = new Set(page.viewer?.incomingAccountIds ?? []);
  const viewerEndorsementIssuerSet = new Set(
    page.viewer?.endorsementIssuers ?? []
  );
  const viewerEndorsementTargetSet = new Set(
    page.viewer?.endorsementTargets ?? []
  );

  return page.profiles.map((row) => {
    const profile: MaterialisedProfile = {
      accountId: row.accountId,
      name: row.name ?? undefined,
      bio: row.bio ?? undefined,
      avatar: row.avatar ?? undefined,
      banner: row.banner ?? undefined,
      kind: row.kind,
      extra: {},
    };
    const outgoing = viewerOutgoingByTarget.get(row.accountId);
    return toProfileListAccount({
      accountId: row.accountId,
      name: row.name ?? null,
      bio: row.bio ?? null,
      avatarUrl: os.profiles.avatarUrl(profile),
      kind: profile.kind ?? null,
      industry: row.industry ?? null,
      openJobsCount: row.openJobsCount ?? 0,
      standingCount: row.standingCount,
      standingWithCount: row.standingWithCount,
      mutualStandingCount: row.mutualStandingCount,
      endorsementsReceivedCount: row.endorsementsReceivedCount,
      endorsementsGivenCount: row.endorsementsGivenCount,
      moodId: 'protocol',
      viewerStanding: Boolean(outgoing),
      theyStandWithViewer: viewerIncomingSet.has(row.accountId),
      targetEndorsedViewer: viewerEndorsementIssuerSet.has(row.accountId),
      viewerEndorsed: viewerEndorsementTargetSet.has(row.accountId),
      standingSince: outgoing?.since ?? null,
      standingBlockTimestamp: outgoing?.blockTimestamp ?? null,
    });
  });
}

export { toProfileListAccount as discoverProfileToProfileListAccount };

/** @deprecated Use {@link discoverProfileToProfileListAccount}. */
export function discoverProfileToStandingSummary(
  profile: DiscoverProfileSummary
) {
  return profileListAccountToStandingSummary(toProfileListAccount(profile));
}
