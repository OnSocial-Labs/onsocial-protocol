import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StandingAccountSummary {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  viewerStanding: boolean;
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
    const [counts, outgoingIds, incomingIds, viewerOutgoingIds] =
      await Promise.all([
        os.standings.counts(accountId),
        os.standings.listOutgoing(accountId, { limit: STANDING_LIST_LIMIT }),
        os.standings.listIncoming(accountId, { limit: STANDING_LIST_LIMIT }),
        viewerAccountId
          ? os.standings
              .listOutgoing(viewerAccountId, { limit: 1000 })
              .catch(() => [])
          : Promise.resolve([]),
      ]);
    const viewerOutgoingSet = new Set(viewerOutgoingIds);
    const viewerStanding =
      Boolean(viewerAccountId) &&
      viewerAccountId !== accountId &&
      viewerOutgoingSet.has(accountId);

    const uniqueAccountIds = Array.from(
      new Set([...outgoingIds, ...incomingIds])
    );
    const profiles = await os.profiles.getMany(uniqueAccountIds);

    const toSummary = (id: string): StandingAccountSummary => {
      const profile = profiles[id] ?? null;
      return {
        accountId: id,
        name: profile?.name ?? null,
        avatarUrl: os.profiles.avatarUrl(profile),
        viewerStanding: viewerOutgoingSet.has(id),
      };
    };

    const response: ProfileSocialResponse = {
      accountId,
      viewerAccountId,
      viewerStanding,
      counts,
      outgoing: outgoingIds.map(toSummary),
      incoming: incomingIds.map(toSummary),
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