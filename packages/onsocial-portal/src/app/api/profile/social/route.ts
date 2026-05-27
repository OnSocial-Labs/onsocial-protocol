import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StandingAccountSummary {
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

interface StandingListItem {
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

interface ProfileSocialResponse {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  counts: {
    incoming: number;
    outgoing: number;
  };
  incoming: StandingAccountSummary[];
  outgoing: StandingAccountSummary[];
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const STANDING_LIST_LIMIT = 8;

function readAccountId(
  request: NextRequest,
  key: 'accountId' | 'viewerAccountId'
): string | null {
  const accountId = request.nextUrl.searchParams.get(key)?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Social graph query failed';
}

function parseStandingSince(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { since?: unknown };
    return typeof parsed.since === 'number' ? parsed.since : null;
  } catch {
    return null;
  }
}

async function listStandingRows(
  os: ReturnType<typeof createPortalServerOnSocialClient>,
  accountId: string,
  direction: 'incoming' | 'outgoing',
  limit: number
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
    query: `query StandingRows($id: String!, $limit: Int!) {
      standingsCurrent(where: {${where}}, limit: $limit) {
        accountId targetAccount value blockHeight blockTimestamp
      }
    }`,
    variables: { id: accountId, limit },
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
  os: ReturnType<typeof createPortalServerOnSocialClient>,
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

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request, 'accountId');
  const viewerAccountId = readAccountId(request, 'viewerAccountId');

  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const os = createPortalServerOnSocialClient();
    const [
      counts,
      outgoingIds,
      incomingIds,
      viewerOutgoingIds,
      viewerIncomingIds,
    ] =
      await Promise.all([
        os.standings.counts(accountId),
        listStandingRows(os, accountId, 'outgoing', STANDING_LIST_LIMIT),
        listStandingRows(os, accountId, 'incoming', STANDING_LIST_LIMIT),
        viewerAccountId
          ? os.standings
              .listOutgoing(viewerAccountId, { limit: 1000 })
              .catch(() => [])
          : Promise.resolve([]),
        viewerAccountId
          ? os.standings
              .listIncoming(viewerAccountId, { limit: 1000 })
              .catch(() => [])
          : Promise.resolve([]),
      ]);
    const viewerOutgoingSet = new Set(viewerOutgoingIds);
    const viewerIncomingSet = new Set(viewerIncomingIds);
    const viewerStanding =
      Boolean(viewerAccountId) &&
      viewerAccountId !== accountId &&
      viewerOutgoingSet.has(accountId);

    const uniqueAccountIds = Array.from(
      new Set([
        ...outgoingIds.map((row) => row.targetAccount),
        ...incomingIds.map((row) => row.accountId),
      ])
    );
    const [profiles, profileStats] = await Promise.all([
      os.profiles.getMany(uniqueAccountIds),
      listProfileStats(os, uniqueAccountIds).catch(() => new Map()),
    ]);

    const toSummary = (
      id: string,
      standingSince: number | null,
      standingBlockTimestamp: number | null
    ): StandingAccountSummary => {
      const profile = profiles[id] ?? null;
      const stats = profileStats.get(id);
      return {
        accountId: id,
        name: profile?.name ?? null,
        bio: profile?.bio ?? null,
        avatarUrl: os.profiles.avatarUrl(profile),
        standingSince,
        standingBlockTimestamp,
        standingCount: stats?.standingCount ?? 0,
        standingWithCount: stats?.standingWithCount ?? 0,
        mutualStandingCount: stats?.mutualStandingCount ?? 0,
        endorsementsReceivedCount: stats?.endorsementsReceivedCount ?? 0,
        endorsementsGivenCount: stats?.endorsementsGivenCount ?? 0,
        viewerStanding: viewerOutgoingSet.has(id),
        theyStandWithViewer: viewerIncomingSet.has(id),
      };
    };

    const response: ProfileSocialResponse = {
      accountId,
      viewerAccountId,
      viewerStanding,
      counts,
      outgoing: outgoingIds.map((row) =>
        toSummary(row.targetAccount, row.since, row.blockTimestamp)
      ),
      incoming: incomingIds.map((row) =>
        toSummary(row.accountId, row.since, row.blockTimestamp)
      ),
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Social graph query failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}