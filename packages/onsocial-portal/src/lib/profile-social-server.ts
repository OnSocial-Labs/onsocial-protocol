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

interface ProfileStats {
  accountId: string;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
}

export const STANDING_PREVIEW_LIMIT = 8;
export const STANDING_PAGE_SIZE = 24;
export const STANDING_MAX_OFFSET = 10_000;

export type PortalOnSocialClient = ReturnType<
  typeof createPortalServerOnSocialClient
>;

export function parseStandingSince(
  raw: string | null | undefined
): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { since?: unknown };
    return typeof parsed.since === 'number' ? parsed.since : null;
  } catch {
    return null;
  }
}

export async function listStandingRows(
  os: PortalOnSocialClient,
  accountId: string,
  direction: Exclude<StandingDirection, 'mutual'>,
  limit: number,
  offset = 0
): Promise<StandingListItem[]> {
  const where =
    direction === 'incoming'
      ? 'targetAccount: {_eq: $id}'
      : 'accountId: {_eq: $id}';
  const res = await os.query.graphql<{
    standingsCurrent: Array<{
      accountId: string;
      targetAccount: string;
      value: string | null;
      blockHeight: number;
      blockTimestamp: number;
    }>;
  }>({
    query: `query StandingRows($id: String!, $limit: Int!, $offset: Int!) {
      standingsCurrent(
        where: {${where}},
        limit: $limit,
        offset: $offset,
        orderBy: [{blockTimestamp: DESC}]
      ) {
        accountId targetAccount value blockHeight blockTimestamp
      }
    }`,
    variables: { id: accountId, limit, offset },
  });

  return (res.data?.standingsCurrent ?? []).map((row) => ({
    accountId: row.accountId,
    targetAccount: row.targetAccount,
    since: parseStandingSince(row.value),
    blockHeight: Number(row.blockHeight) || 0,
    blockTimestamp: Number(row.blockTimestamp) || 0,
  }));
}

async function listProfileStats(
  os: PortalOnSocialClient,
  accountIds: string[]
): Promise<Map<string, ProfileStats>> {
  if (accountIds.length === 0) return new Map();

  const res = await os.query.graphql<{
    profileSearch: ProfileStats[];
  }>({
    query: `query ProfileStandingStats($ids: [String!], $limit: Int!) {
      profileSearch(where: {accountId: {_in: $ids}}, limit: $limit) {
        accountId
        standingCount standingWithCount mutualStandingCount
        endorsementsReceivedCount endorsementsGivenCount
      }
    }`,
    variables: { ids: accountIds, limit: accountIds.length },
  });

  return new Map(
    (res.data?.profileSearch ?? []).map((row) => [
      row.accountId,
      {
        accountId: row.accountId,
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
  return os.query.standings.mutualCount(accountId);
}

type StandingGraphqlRow = {
  accountId: string;
  targetAccount: string;
  value: string | null;
  blockHeight: number;
  blockTimestamp: number;
};

function mapStandingGraphqlRow(row: StandingGraphqlRow): StandingListItem {
  return {
    accountId: row.accountId,
    targetAccount: row.targetAccount,
    since: parseStandingSince(row.value),
    blockHeight: Number(row.blockHeight) || 0,
    blockTimestamp: Number(row.blockTimestamp) || 0,
  };
}

async function listFilteredStandingRows(
  os: PortalOnSocialClient,
  accountId: string,
  direction: Exclude<StandingDirection, 'mutual'>,
  participantIds: string[],
  limit: number,
  offset: number
): Promise<{ rows: StandingListItem[]; total: number }> {
  if (participantIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const participantField =
    direction === 'incoming' ? 'accountId' : 'targetAccount';
  const anchorField = direction === 'incoming' ? 'targetAccount' : 'accountId';

  const [pageRes, countRes] = await Promise.all([
    os.query.graphql<{ standingsCurrent: StandingGraphqlRow[] }>({
      query: `query FilteredStandingRows($anchor: String!, $ids: [String!]!, $limit: Int!, $offset: Int!) {
        standingsCurrent(
          where: {${anchorField}: {_eq: $anchor}, ${participantField}: {_in: $ids}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: {
        anchor: accountId,
        ids: participantIds,
        limit,
        offset,
      },
    }),
    os.query.graphql<{ standingsCurrent: Array<{ accountId: string }> }>({
      query: `query FilteredStandingCount($anchor: String!, $ids: [String!]!) {
        standingsCurrent(
          where: {${anchorField}: {_eq: $anchor}, ${participantField}: {_in: $ids}}
        ) {
          accountId
        }
      }`,
      variables: { anchor: accountId, ids: participantIds },
    }),
  ]);

  return {
    rows: (pageRes.data?.standingsCurrent ?? []).map(mapStandingGraphqlRow),
    total: countRes.data?.standingsCurrent?.length ?? 0,
  };
}

async function listMutualStandingRowsFiltered(
  os: PortalOnSocialClient,
  accountId: string,
  participantIds: string[],
  limit: number,
  offset: number
): Promise<{ rows: StandingListItem[]; total: number }> {
  if (participantIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const [rows, total] = await Promise.all([
    os.query.standings.mutualFilteredDetailed(accountId, participantIds, {
      limit,
      offset,
    }),
    os.query.standings.mutualFilteredCount(accountId, participantIds),
  ]);

  return { rows, total };
}

async function listMutualStandingRows(
  os: PortalOnSocialClient,
  accountId: string,
  limit: number,
  offset: number
): Promise<StandingListItem[]> {
  return os.query.standings.mutualDetailed(accountId, { limit, offset });
}

async function loadViewerContext(
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
    os.query.standings.outgoingTargetsAmong(viewerAccountId, peers).catch(() => []),
    os.query.standings.incomingSourcesAmong(viewerAccountId, peers).catch(() => []),
  ]);

  return {
    viewerOutgoingSet: new Set(
      outgoing.map((row: StandingListItem) => row.targetAccount)
    ),
    viewerIncomingSet: new Set(incoming),
  };
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
        ? await listMutualStandingRowsFiltered(
            os,
            accountId,
            participantIds,
            limit,
            offset
          )
        : await listFilteredStandingRows(
            os,
            accountId,
            direction,
            participantIds,
            limit,
            offset
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
