import type { MaterialisedProfile, OnSocial, PageMoodId } from '@onsocial/sdk';
import type {
  DiscoverProfileSummary,
  DiscoverProfilesResponse,
} from '@/lib/discover-profiles';

type DiscoverPageResult = Awaited<
  ReturnType<OnSocial['query']['profiles']['discoverPage']>
>;

export async function mapDiscoverPageToResponse(
  os: OnSocial,
  page: DiscoverPageResult,
  query: string,
  limit: number,
  offset: number
): Promise<DiscoverProfilesResponse> {
  const viewerOutgoingByTarget = new Map(
    (page.viewer?.outgoing ?? []).map((row) => [row.targetAccount, row])
  );
  const viewerIncomingSet = new Set(page.viewer?.incomingAccountIds ?? []);
  const viewerEndorsementIssuerSet = new Set(
    page.viewer?.endorsementIssuers ?? []
  );

  let moodIds: Partial<Record<string, PageMoodId>> = {};
  const accountIds = page.profiles.map((row) => row.accountId);
  if (accountIds.length > 0) {
    try {
      moodIds = await os.query.pages.getMoodIdsForAccounts(accountIds);
    } catch {
      // Mood hints are optional.
    }
  }

  const profiles: DiscoverProfileSummary[] = page.profiles.map((row) => {
    const profile: MaterialisedProfile = {
      accountId: row.accountId,
      name: row.name ?? undefined,
      bio: row.bio ?? undefined,
      avatar: row.avatar ?? undefined,
      banner: row.banner ?? undefined,
      extra: {},
    };

    const outgoing = viewerOutgoingByTarget.get(row.accountId);

    return {
      accountId: row.accountId,
      name: row.name ?? null,
      bio: row.bio ?? null,
      avatarUrl: os.profiles.avatarUrl(profile),
      standingCount: row.standingCount,
      standingWithCount: row.standingWithCount,
      mutualStandingCount: row.mutualStandingCount,
      endorsementsReceivedCount: row.endorsementsReceivedCount,
      endorsementsGivenCount: row.endorsementsGivenCount,
      moodId: moodIds[row.accountId] ?? 'protocol',
      viewerStanding: Boolean(outgoing),
      theyStandWithViewer: viewerIncomingSet.has(row.accountId),
      targetEndorsedViewer: viewerEndorsementIssuerSet.has(row.accountId),
      standingSince: outgoing?.since ?? null,
      standingBlockTimestamp: outgoing?.blockTimestamp ?? null,
    };
  });

  return {
    query,
    limit,
    offset,
    hasMore: page.profiles.length === limit,
    profiles,
  };
}
