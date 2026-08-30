import { NextRequest, NextResponse } from 'next/server';
import { createAppOnSocialClient } from '@/lib/profile-social-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  return 'Standing relationship lookup failed';
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request, 'accountId');
  const viewerAccountId = readAccountId(request, 'viewerAccountId');

  if (!accountId || !viewerAccountId) {
    return NextResponse.json(
      {
        error:
          'Valid accountId and viewerAccountId query parameters are required',
      },
      { status: 400 }
    );
  }

  if (accountId === viewerAccountId) {
    return NextResponse.json({
      accountId,
      viewerAccountId,
      viewerStanding: false,
      theyStandWithViewer: false,
      viewerEndorsed: false,
      viewerEndorsementTopics: [],
    });
  }

  try {
    const os = createAppOnSocialClient();
    const [viewerStanding, theyStandWithViewer, endorsementRows] =
      await Promise.all([
        os.standings.viewerStandsWith(viewerAccountId, accountId),
        os.standings.viewerStandsWith(accountId, viewerAccountId),
        os.endorsements
          .listFromViewerToTarget(viewerAccountId, accountId, {
            limit: 8,
          })
          .catch(() => []),
      ]);
    const viewerEndorsementTopics = endorsementRows.map(
      (row) => row.topic ?? ''
    );

    return NextResponse.json(
      {
        accountId,
        viewerAccountId,
        viewerStanding,
        theyStandWithViewer,
        viewerEndorsed: endorsementRows.length > 0,
        viewerEndorsementTopics,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Standing relationship lookup failed',
        detail: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
