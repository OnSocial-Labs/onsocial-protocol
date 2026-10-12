import { NextRequest, NextResponse } from 'next/server';
import {
  STANDING_PAGE_SIZE,
  createAppOnSocialClient,
  listStandingViewerLines,
} from '@/lib/profile-social-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Standing viewer lines query failed';
}

export async function GET(request: NextRequest) {
  const viewerAccountId =
    request.nextUrl.searchParams.get('viewerAccountId')?.trim() ?? '';
  if (!ACCOUNT_ID_PATTERN.test(viewerAccountId)) {
    return NextResponse.json(
      { error: 'A valid viewerAccountId query parameter is required' },
      { status: 400 }
    );
  }

  const peerIds = [
    ...new Set(
      request.nextUrl.searchParams
        .getAll('peerId')
        .map((id) => id.trim())
        .filter((id) => ACCOUNT_ID_PATTERN.test(id) && id !== viewerAccountId)
    ),
  ];
  if (peerIds.length > STANDING_PAGE_SIZE) {
    return NextResponse.json({ error: 'Too many peer ids' }, { status: 400 });
  }

  try {
    const lines = await listStandingViewerLines(
      createAppOnSocialClient(),
      viewerAccountId,
      peerIds
    );
    return NextResponse.json(lines, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Standing viewer lines query failed',
        detail: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
