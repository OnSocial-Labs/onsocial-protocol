import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { loadPortalRewardsOverview } from '@/lib/portal-rewards-overview-server';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';
import type { RewardsUserRewardsOverviewView } from '@/lib/near-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OVERVIEW_CACHE_TTL_MS = 15_000;
const overviewCache =
  createPortalRequestCache<RewardsUserRewardsOverviewView | null>(
    OVERVIEW_CACHE_TTL_MS
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
  return 'Rewards overview query failed';
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
    const os = createPortalServerOnSocialClient();
    const overview = wantsFresh(request)
      ? await loadPortalRewardsOverview(os, accountId)
      : await overviewCache.getOrLoad(accountId, () =>
          loadPortalRewardsOverview(os, accountId)
        );

    return NextResponse.json(
      { overview },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'Rewards lookup is busy — try again shortly'
          : 'Rewards overview query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
