import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalProfileSupportBalance,
  type PortalProfileSupportBalance,
} from '@/lib/portal-profile-support-balance';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORT_BALANCE_CACHE_TTL_MS = 30_000;
const supportBalanceCache =
  createPortalRequestCache<PortalProfileSupportBalance>(
    SUPPORT_BALANCE_CACHE_TTL_MS
  );

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function wantsFresh(request: NextRequest): boolean {
  const fresh = request.nextUrl.searchParams.get('fresh')?.trim();
  return fresh === '1' || fresh === 'true';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile support balance query failed';
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
    const response = wantsFresh(request)
      ? await loadPortalProfileSupportBalance(accountId)
      : await supportBalanceCache.getOrLoad(accountId, () =>
          loadPortalProfileSupportBalance(accountId)
        );

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'Support balance lookup is busy — try again shortly'
          : 'Profile support balance query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
