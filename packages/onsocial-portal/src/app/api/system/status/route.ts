import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalSystemStatus,
  type PortalSystemStatusPayload,
} from '@/lib/portal-system-status-server';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_CACHE_TTL_MS = 60_000;
const statusCache =
  createPortalRequestCache<PortalSystemStatusPayload>(STATUS_CACHE_TTL_MS);

function wantsFresh(request: NextRequest): boolean {
  const fresh = request.nextUrl.searchParams.get('fresh')?.trim();
  return fresh === '1' || fresh === 'true';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'System status query failed';
}

export async function GET(request: NextRequest) {
  try {
    const payload = wantsFresh(request)
      ? await loadPortalSystemStatus()
      : await statusCache.getOrLoad('contracts', () =>
          loadPortalSystemStatus()
        );

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'System status lookup is busy — try again shortly'
          : 'System status query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
