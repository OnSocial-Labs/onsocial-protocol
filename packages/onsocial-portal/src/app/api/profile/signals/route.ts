import { NextRequest, NextResponse } from 'next/server';
import { loadPortalProfileSignals } from '@/lib/portal-profile-signals';
import type { ReputationEntry } from '@/lib/leaderboard';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProfileSignalsResponse {
  accountId: string;
  reputation: ReputationEntry | null;
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const REVALIDATE_SECONDS = 30;
const signalsCache = createPortalRequestCache<ProfileSignalsResponse>(
  REVALIDATE_SECONDS * 1000
);

function getAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile signals query failed';
}

export async function GET(request: NextRequest) {
  const accountId = getAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const response = await signalsCache.getOrLoad(accountId, () =>
      loadPortalProfileSignals(accountId)
    );

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `private, max-age=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'Profile signals are busy — try again shortly'
          : 'Profile signals query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
