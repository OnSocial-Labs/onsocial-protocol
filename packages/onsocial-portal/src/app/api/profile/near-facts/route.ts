import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalProfileNearFacts,
  type PortalProfileNearFacts,
} from '@/lib/portal-profile-near-facts';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NEAR_FACTS_CACHE_TTL_MS = 120_000;
const nearFactsCache = createPortalRequestCache<PortalProfileNearFacts>(
  NEAR_FACTS_CACHE_TTL_MS
);

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function getAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'NEAR account facts query failed';
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
    const response = await nearFactsCache.getOrLoad(accountId, () =>
      loadPortalProfileNearFacts(accountId)
    );

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'NEAR account lookup is busy — try again shortly'
          : 'NEAR account facts query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
