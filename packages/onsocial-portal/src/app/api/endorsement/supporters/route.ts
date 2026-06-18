import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalEndorsementSupporters,
  type PortalEndorsementSupportersPage,
} from '@/lib/portal-endorsement-supporters';
import { normalizeEndorsementSupportId } from '@/lib/portal-endorsement-support-total';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTERS_CACHE_TTL_MS = 30_000;

function cacheKey(
  endorsementId: string,
  viewerAccountId: string | null,
  searchQuery: string
): string {
  return `${endorsementId}:${viewerAccountId ?? ''}:${searchQuery}`;
}

const supportersCache =
  createPortalRequestCache<PortalEndorsementSupportersPage>(
    SUPPORTERS_CACHE_TTL_MS
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
  return 'Endorsement supporters query failed';
}

export async function GET(request: NextRequest) {
  const endorsementId = readEndorsementId(request);
  if (!endorsementId) {
    return NextResponse.json(
      { error: 'A valid endorsementId query parameter is required' },
      { status: 400 }
    );
  }

  const viewerAccountId =
    request.nextUrl.searchParams.get('viewerAccountId')?.trim() || null;
  const searchQuery = normalizeProfileSearchQuery(
    request.nextUrl.searchParams.get('q')
  );
  const key = cacheKey(endorsementId, viewerAccountId, searchQuery);

  try {
    const response = wantsFresh(request)
      ? await loadPortalEndorsementSupporters(
          endorsementId,
          viewerAccountId,
          searchQuery
        )
      : await supportersCache.getOrLoad(key, () =>
          loadPortalEndorsementSupporters(
            endorsementId,
            viewerAccountId,
            searchQuery
          )
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
          ? 'Supporters lookup is busy — try again shortly'
          : 'Endorsement supporters query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
