import { NextRequest, NextResponse } from 'next/server';
import { loadAppRewardsOverview } from '@/lib/app-rewards-chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return null;
  }
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Rewards lookup failed';
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const overview = await loadAppRewardsOverview(accountId);

    return NextResponse.json(
      {
        overview: overview ?? {
          claimable: '0',
          total_earned: '0',
          total_claimed: '0',
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Rewards lookup failed',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
