import { NextRequest, NextResponse } from 'next/server';
import { loadRewardsAppConfig } from '@/lib/portal-governance-chain-server';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';
import type { OnChainAppConfig } from '@/lib/near-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_CONFIG_CACHE_TTL_MS = 60_000;
const appConfigCache = createPortalRequestCache<OnChainAppConfig | null>(
  APP_CONFIG_CACHE_TTL_MS
);

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function readAppId(request: NextRequest): string {
  const appId = request.nextUrl.searchParams.get('appId')?.trim();
  if (!appId || !APP_ID_PATTERN.test(appId)) {
    throw new Error('A valid appId query parameter is required');
  }
  return appId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'App config query failed';
}

export async function GET(request: NextRequest) {
  try {
    const appId = readAppId(request);
    const config = await appConfigCache.getOrLoad(appId, () =>
      loadRewardsAppConfig(appId)
    );

    return NextResponse.json(
      { config },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'App config lookup is busy — try again shortly'
          : detail.includes('appId')
            ? detail
            : 'App config query failed',
        detail,
      },
      {
        status: isRateLimitError(error)
          ? 429
          : detail.includes('appId')
            ? 400
            : 502,
      }
    );
  }
}
