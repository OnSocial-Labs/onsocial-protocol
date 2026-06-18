import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalEndorsementSupportGiven,
  type PortalEndorsementSupportGivenPage,
} from '@/lib/portal-endorsement-support-given';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORT_GIVEN_CACHE_TTL_MS = 30_000;

function cacheKey(accountId: string, limit: number, offset: number): string {
  return `${accountId}:${limit}:${offset}`;
}

const supportGivenCache =
  createPortalRequestCache<PortalEndorsementSupportGivenPage>(
    SUPPORT_GIVEN_CACHE_TTL_MS
  );

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  return accountId || null;
}

function readLimit(request: NextRequest): number {
  const raw = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? '50',
    10
  );
  if (!Number.isFinite(raw) || raw < 1) return 50;
  return Math.min(raw, 100);
}

function readOffset(request: NextRequest): number {
  const raw = Number.parseInt(
    request.nextUrl.searchParams.get('offset') ?? '0',
    10
  );
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

function wantsFresh(request: NextRequest): boolean {
  const fresh = request.nextUrl.searchParams.get('fresh')?.trim();
  return fresh === '1' || fresh === 'true';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Endorsement support given query failed';
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  const limit = readLimit(request);
  const offset = readOffset(request);
  const key = cacheKey(accountId, limit, offset);

  try {
    const response = wantsFresh(request)
      ? await loadPortalEndorsementSupportGiven(accountId, { limit, offset })
      : await supportGivenCache.getOrLoad(key, () =>
          loadPortalEndorsementSupportGiven(accountId, { limit, offset })
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
          ? 'Support given lookup is busy — try again shortly'
          : 'Endorsement support given query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
