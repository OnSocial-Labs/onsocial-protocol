import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  isProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';

export type StandingDirection = 'incoming' | 'outgoing' | 'mutual';

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
}

export interface StandingListItem {
  accountId: string;
  targetAccount: string;
  since: number | null;
  blockHeight: number;
  blockTimestamp: number;
}

export const STANDING_PREVIEW_LIMIT = 8;
export const STANDING_PAGE_SIZE = 24;
export const STANDING_MAX_OFFSET = 10_000;

export type PortalOnSocialClient = ReturnType<
  typeof createPortalServerOnSocialClient
>;

export async function listProfileStats(
  os: PortalOnSocialClient,
  accountIds: string[]
): Promise<
  Map<
    string,
    {
      standingCount: number;
      standingWithCount: number;
      mutualStandingCount: number;
      endorsementsReceivedCount: number;
      endorsementsGivenCount: number;
    }
  >
> {
  const rows = await os.query.profiles.statsForAccounts(accountIds);
  return new Map(
    rows.map((row) => [
      row.accountId,
      {
        standingCount: Number(row.standingCount) || 0,
        standingWithCount: Number(row.standingWithCount) || 0,
        mutualStandingCount: Number(row.mutualStandingCount) || 0,
        endorsementsReceivedCount: Number(row.endorsementsReceivedCount) || 0,
        endorsementsGivenCount: Number(row.endorsementsGivenCount) || 0,
      },
    ])
  );
}

export async function countMutualStandings(
  os: PortalOnSocialClient,
  accountId: string
): Promise<number> {
  return os.standings.mutualCount(accountId);
}

async function listStandingRows(
  os: PortalOnSocialClient,
  accountId: string,
  direction: Exclude<StandingDirection, 'mutual'>,
  limit: number,
  offset: number
): Promise<StandingListItem[]> {
  return direction === 'incoming'
    ? os.standings.listIncomingDetailed(accountId, { limit, offset })
    : os.standings.listOutgoingDetailed(accountId, { limit, offset });
}

async function listMutualStandingRows(
  os: PortalOnSocialClient,
  accountId: string,
  limit: number,
  offset: number
): Promise<StandingListItem[]> {
  return os.standings.mutualList(accountId, { limit, offset });
}

export async function loadViewerContext(
  os: PortalOnSocialClient,
  viewerAccountId: string | null,
  peerAccountIds: string[]
) {
  if (!viewerAccountId) {
    return {
      viewerOutgoingSet: new Set<string>(),
      viewerIncomingSet: new Set<string>(),
    };
  }

  const peers = [...new Set(peerAccountIds.filter(Boolean))];
  if (peers.length === 0) {
    return {
      viewerOutgoingSet: new Set<string>(),
      viewerIncomingSet: new Set<string>(),
    };
  }

  const [outgoing, incoming] = await Promise.all([
    os.query.standings
      .outgoingTargetsAmong(viewerAccountId, peers)
      .catch(() => []),
    os.query.standings
      .incomingSourcesAmong(viewerAccountId, peers)
      .catch(() => []),
  ]);

  return {
    viewerOutgoingSet: new Set(outgoing.map((row) => row.targetAccount)),
    viewerIncomingSet: new Set(incoming),
  };
}

export function mapStandingRowsToSummaries(
  os: PortalOnSocialClient,
  rows: StandingListItem[],
  direction: StandingDirection,
  profiles: Record<string, MaterialisedProfile>,
  profileStats: Map<
    string,
    {
      standingCount: number;
      standingWithCount: number;
      mutualStandingCount: number;
      endorsementsReceivedCount: number;
      endorsementsGivenCount: number;
    }
  >,
  viewerOutgoingSet: Set<string>,
  viewerIncomingSet: Set<string>
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
    };
  });
}

export async function buildStandingAccountSummaries(
  os: PortalOnSocialClient,
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
  const [profiles, profileStats, { viewerOutgoingSet, viewerIncomingSet }] =
    await Promise.all([
      os.profiles.getMany(accountIds),
      listProfileStats(os, accountIds).catch(() => new Map()),
      loadViewerContext(os, viewerAccountId, accountIds),
    ]);

  return mapStandingRowsToSummaries(
    os,
    rows,
    direction,
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );
}

export async function listStandingAccountsPage(
  os: PortalOnSocialClient,
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

  const counts = await os.standings.counts(accountId);
  const total =
    direction === 'incoming'
      ? counts.incoming
      : direction === 'outgoing'
        ? counts.outgoing
        : await countMutualStandings(os, accountId);

  const rows =
    direction === 'mutual'
      ? await listMutualStandingRows(os, accountId, limit, offset)
      : await listStandingRows(os, accountId, direction, limit, offset);

  const accounts = await buildStandingAccountSummaries(
    os,
    rows,
    direction,
    viewerAccountId
  );

  return {
    accounts,
    hasMore: offset + accounts.length < total,
    total,
  };
}

// Re-export for any legacy imports (same implementation as SDK rows).
export { listStandingRows };
