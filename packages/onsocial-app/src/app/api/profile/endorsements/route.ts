import { NextRequest, NextResponse } from 'next/server';
import { loadEndorsementsPageData } from '@/lib/load-endorsements-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      {
        error: 'Invalid accountId',
        detail: 'Provide a valid NEAR account id.',
      },
      { status: 400 }
    );
  }

  const data = await loadEndorsementsPageData(accountId);
  if (!data) {
    return NextResponse.json(
      {
        error: 'Endorsements unavailable',
        detail: 'Endorsements query failed',
      },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
