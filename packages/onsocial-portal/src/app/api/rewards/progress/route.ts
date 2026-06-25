import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { loadPortalRewardActionProgress } from '@/lib/portal-reward-progress-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Reward progress lookup failed';
}

/** @deprecated Prefer `/api/rewards/overview` for unified rewards state. */
export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    createPortalServerOnSocialClient();
    const actions = await loadPortalRewardActionProgress(accountId);
    if (!actions) {
      return NextResponse.json(
        { error: 'Reward progress lookup failed' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { actions },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Reward progress lookup failed',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
