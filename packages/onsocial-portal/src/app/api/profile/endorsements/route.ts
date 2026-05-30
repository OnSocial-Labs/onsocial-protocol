import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import {
  ENDORSEMENT_MAX_OFFSET,
  ENDORSEMENT_PAGE_SIZE,
  type EndorsementListMode,
  loadEndorsementPreview,
  listEndorsementsPage,
} from '@/lib/profile-endorsements-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const REVALIDATE_SECONDS = 30;

function getAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getViewerAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('viewerAccountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getMode(request: NextRequest): EndorsementListMode | null {
  const mode = request.nextUrl.searchParams.get('mode')?.trim();
  if (mode === 'received' || mode === 'given') return mode;
  return null;
}

function getLimit(request: NextRequest): number {
  const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return ENDORSEMENT_PAGE_SIZE;
  return Math.min(ENDORSEMENT_PAGE_SIZE, Math.floor(rawLimit));
}

function getOffset(request: NextRequest): number {
  const rawOffset = Number(request.nextUrl.searchParams.get('offset'));
  if (!Number.isFinite(rawOffset) || rawOffset < 0) return 0;
  return Math.min(ENDORSEMENT_MAX_OFFSET, Math.floor(rawOffset));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Endorsements query failed';
}

export async function GET(request: NextRequest) {
  const accountId = getAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  const mode = getMode(request);

  try {
    const os = createPortalServerOnSocialClient();

    if (mode) {
      const limit = getLimit(request);
      const offset = getOffset(request);
      const q = normalizeProfileSearchQuery(
        request.nextUrl.searchParams.get('q')
      );
      const page = await listEndorsementsPage(
        os,
        accountId,
        mode,
        limit,
        offset,
        q
      );

      return NextResponse.json(
        {
          accountId,
          mode,
          limit,
          offset,
          hasMore: page.hasMore,
          total: page.total,
          endorsements: page.endorsements,
          ...(q ? { q } : {}),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const preview = await loadEndorsementPreview(
      os,
      accountId,
      getViewerAccountId(request)
    );

    return NextResponse.json(
      {
        accountId,
        counts: preview.counts,
        received: preview.received,
        given: preview.given,
        viewerToTarget: preview.viewerToTarget,
      },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 3}`,
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey =
      detail.includes('ONSOCIAL_API_KEY') ||
      detail.includes('GATEWAY_SERVICE_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Endorsements query failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
