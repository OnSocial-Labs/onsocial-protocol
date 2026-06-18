import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalEndorsementSupportTotal,
  normalizeEndorsementSupportId,
  type PortalEndorsementSupportTotal,
} from '@/lib/portal-endorsement-support-total';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORT_TOTAL_CACHE_TTL_MS = 30_000;
const supportTotalCache =
  createPortalRequestCache<PortalEndorsementSupportTotal>(
    SUPPORT_TOTAL_CACHE_TTL_MS
  );

function readEndorsementId(request: NextRequest): string | null {
  const endorsementId = request.nextUrl.searchParams
    .get('endorsementId')
    ?.trim();
  if (!endorsementId) return null;
  return normalizeEndorsementSupportId(endorsementId);
}

function wantsFresh(request: NextRequest): boolean {
  const fresh = request.nextUrl.searchParams.get('fresh')?.trim();
  return fresh === '1' || fresh === 'true';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Endorsement support total query failed';
}

export async function GET(request: NextRequest) {
  const endorsementId = readEndorsementId(request);
  if (!endorsementId) {
    return NextResponse.json(
      { error: 'A valid endorsementId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const response = wantsFresh(request)
      ? await loadPortalEndorsementSupportTotal(endorsementId)
      : await supportTotalCache.getOrLoad(endorsementId, () =>
          loadPortalEndorsementSupportTotal(endorsementId)
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
          ? 'Support total lookup is busy — try again shortly'
          : 'Endorsement support total query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
