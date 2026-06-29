import { NextRequest, NextResponse } from 'next/server';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import {
  STANDING_MAX_OFFSET,
  STANDING_PAGE_SIZE,
  createAppOnSocialClient,
  listStandingAccountsPage,
  type StandingDirection,
} from '@/lib/profile-social-server';

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

function getDirection(request: NextRequest): StandingDirection | null {
  const direction = request.nextUrl.searchParams.get('direction')?.trim();
  if (
    direction === 'incoming' ||
    direction === 'outgoing' ||
    direction === 'mutual'
  ) {
    return direction;
  }
  return null;
}

function getLimit(request: NextRequest): number {
  const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return STANDING_PAGE_SIZE;
  return Math.min(STANDING_PAGE_SIZE, Math.floor(rawLimit));
}

function getOffset(request: NextRequest): number {
  const rawOffset = Number(request.nextUrl.searchParams.get('offset'));
  if (!Number.isFinite(rawOffset) || rawOffset < 0) return 0;
  return Math.min(STANDING_MAX_OFFSET, Math.floor(rawOffset));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Social standings query failed';
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request, 'accountId');
  const viewerAccountId = readAccountId(request, 'viewerAccountId');
  const direction = getDirection(request);

  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  if (!direction) {
    return NextResponse.json(
      {
        error:
          'A valid direction query parameter is required (incoming, outgoing, or mutual)',
      },
      { status: 400 }
    );
  }

  const limit = getLimit(request);
  const offset = getOffset(request);
  const q = normalizeProfileSearchQuery(request.nextUrl.searchParams.get('q'));

  try {
    const os = createAppOnSocialClient();
    const page = await listStandingAccountsPage(
      os,
      accountId,
      direction,
      viewerAccountId,
      limit,
      offset,
      q
    );

    return NextResponse.json(
      {
        accountId,
        viewerAccountId,
        direction,
        limit,
        offset,
        hasMore: page.hasMore,
        total: page.total,
        accounts: page.accounts,
        ...(page.counts ? { counts: page.counts } : {}),
        ...(q ? { q } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Social standings query failed', detail: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
