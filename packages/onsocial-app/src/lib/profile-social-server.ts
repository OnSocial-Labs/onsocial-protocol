import type {
  MaterialisedProfile,
  OnSocial,
  PageMoodId,
  ProfileSearchRow,
} from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  isProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';
import type { StanceDetailKind } from '@/lib/profile-social-standings';

export type StandingDirection = StanceDetailKind;

export interface StandingAccountSummary {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  standingSince: number | null;
  standingBlockTimestamp: number | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  moodId: PageMoodId;
}

export interface StandingListItem {
  accountId: string;
  targetAccount: string;
  since: number | null;
  blockHeight: number;
  blockTimestamp: number;
}

export const STANDING_PAGE_SIZE = 24;
export const STANDING_MAX_OFFSET = 10_000;

export type AppOnSocialClient = OnSocial;

export function createAppOnSocialClient(): AppOnSocialClient {
  return createServerOnSocialClient();
}

function profileSearchRowToMaterialised(row: ProfileSearchRow): MaterialisedProfile {
  return {
    accountId: row.accountId,
    name: row.name ?? undefined,
    bio: row.bio ?? undefined,
    avatar: row.avatar ?? undefined,
    banner: row.banner ?? undefined,
    extra: {},
  };
}

function profileStatsFromSearchRow(row: ProfileSearchRow) {
  return {
    standingCount: Number(row.standingCount) || 0,
    standingWithCount: Number(row.standingWithCount) || 0,
    mutualStandingCount: Number(row.mutualStandingCount) || 0,
    endorsementsReceivedCount: Number(row.endorsementsReceivedCount) || 0,
    endorsementsGivenCount: Number(row.endorsementsGivenCount) || 0,
  };
}

function mapStandingRowsToSummaries(
  os: AppOnSocialClient,
  rows: StandingListItem[],
  direction: StandingDirection,
  profiles: Record<string, MaterialisedProfile>,
  profileStats: Map<
    string,
    ReturnType<typeof profileStatsFromSearchRow>
  >,
  viewerOutgoingSet: Set<string>,
  viewerIncomingSet: Set<string>,
  moodIds: Partial<Record<string, PageMoodId>>
): StandingAccountSummary[] {
  return rows.map((row) => {
    const id = direction === 'outgoing' ? row.targetAccount : row.accountId;
    const profile = profiles[id] ?? null;
    const stats = profileStats.get(id);
    const materialisedProfile: MaterialisedProfile | null = profile
      ? {
          accountId: id,
          name: profile.name ?? undefined,
          bio: profile.bio ?? undefined,
          avatar: profile.avatar ?? undefined,
          banner: profile.banner ?? undefined,
          extra: {},
        }
      : null;

    return {
      accountId: id,
      name: profile?.name ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: os.profiles.avatarUrl(materialisedProfile),
      standingSince: row.since,
      standingBlockTimestamp: row.blockTimestamp,
      standingCount: stats?.standingCount ?? 0,
      standingWithCount: stats?.standingWithCount ?? 0,
      mutualStandingCount: stats?.mutualStandingCount ?? 0,
      endorsementsReceivedCount: stats?.endorsementsReceivedCount ?? 0,
      endorsementsGivenCount: stats?.endorsementsGivenCount ?? 0,
      viewerStanding: viewerOutgoingSet.has(id),
      theyStandWithViewer: viewerIncomingSet.has(id),
      moodId: moodIds[id] ?? 'protocol',
    };
  });
}

async function buildStandingAccountSummaries(
  os: AppOnSocialClient,
  rows: StandingListItem[],
  direction: StandingDirection,
  viewerAccountId: string | null
): Promise<StandingAccountSummary[]> {
  const accountIds = Array.from(
    new Set(
      rows.map((row) =>
        direction === 'outgoing' ? row.targetAccount : row.accountId
      )
    )
  );

  let moodIds: Partial<Record<string, PageMoodId>> = {};
  if (accountIds.length > 0) {
    try {
      moodIds = await os.query.pages.getMoodIdsForAccounts(accountIds);
    } catch {
      // Mood hints are optional — standing list still works without them.
    }
  }

  const enrichment = await os.standings.enrichPeers(
    viewerAccountId,
    accountIds
  );

  const profiles: Record<string, MaterialisedProfile> = {};
  const profileStats = new Map<
    string,
    ReturnType<typeof profileStatsFromSearchRow>
  >();

  for (const row of enrichment.profiles) {
    profiles[row.accountId] = profileSearchRowToMaterialised(row);
    profileStats.set(row.accountId, profileStatsFromSearchRow(row));
  }

  const viewerOutgoingSet = new Set(enrichment.viewerOutgoingPeerIds);
  const viewerIncomingSet = new Set(enrichment.viewerIncomingPeerIds);

  return mapStandingRowsToSummaries(
    os,
    rows,
    direction,
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet,
    moodIds
  );
}

export async function listStandingAccountsPage(
  os: AppOnSocialClient,
  accountId: string,
  direction: StandingDirection,
  viewerAccountId: string | null,
  limit: number,
  offset: number,
  searchQuery?: string | null
): Promise<{
  accounts: StandingAccountSummary[];
  hasMore: boolean;
  total: number;
  counts?: { incoming: number; outgoing: number; mutual: number };
}> {
  if (isProfileSearchQuery(searchQuery)) {
    const participantIds = await searchMatchingAccountIds(os, searchQuery);
    const filtered =
      direction === 'mutual'
        ? await (async () => {
            const [rows, total] = await Promise.all([
              os.query.standings.mutualFilteredDetailed(
                accountId,
                participantIds,
                { limit, offset }
              ),
              os.query.standings.mutualFilteredCount(accountId, participantIds),
            ]);
            return { rows, total };
          })()
        : direction === 'incoming'
          ? await os.query.standings.incomingFilteredPage(
              accountId,
              participantIds,
              { limit, offset }
            )
          : await os.query.standings.outgoingFilteredPage(
              accountId,
              participantIds,
              { limit, offset }
            );

    const accounts = await buildStandingAccountSummaries(
      os,
      filtered.rows,
      direction,
      viewerAccountId
    );

    return {
      accounts,
      hasMore: offset + accounts.length < filtered.total,
      total: filtered.total,
    };
  }

  const page = await os.standings.listPage({
    accountId,
    direction,
    limit,
    offset,
    includeCounts: offset === 0,
  });

  const accounts = await buildStandingAccountSummaries(
    os,
    page.rows,
    direction,
    viewerAccountId
  );

  return {
    accounts,
    hasMore: offset + accounts.length < page.total,
    total: page.total,
    ...(page.counts ? { counts: page.counts } : {}),
  };
}
