import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  STANDING_PREVIEW_LIMIT,
  buildStandingAccountSummaries,
  countMutualStandings,
  listStandingRows,
} from '@/lib/profile-social-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProfileSocialResponse {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  incoming: Awaited<ReturnType<typeof buildStandingAccountSummaries>>;
  outgoing: Awaited<ReturnType<typeof buildStandingAccountSummaries>>;
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

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
    const [counts, outgoingRows, incomingRows, mutualCount, viewerOutgoingIds] =
      await Promise.all([
        os.standings.counts(accountId),
        listStandingRows(os, accountId, 'outgoing', STANDING_PREVIEW_LIMIT, 0),
        listStandingRows(os, accountId, 'incoming', STANDING_PREVIEW_LIMIT, 0),
        countMutualStandings(os, accountId),
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

    const [incoming, outgoing] = await Promise.all([
      buildStandingAccountSummaries(
        os,
        incomingRows,
        'incoming',
        viewerAccountId
      ),
      buildStandingAccountSummaries(
        os,
        outgoingRows,
        'outgoing',
        viewerAccountId
      ),
    ]);

    const response: ProfileSocialResponse = {
      accountId,
      viewerAccountId,
      viewerStanding,
      counts: {
        incoming: counts.incoming,
        outgoing: counts.outgoing,
        mutual: mutualCount,
      },
      incoming,
      outgoing,
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
