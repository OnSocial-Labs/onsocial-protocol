import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  loadPortalProfileSocial,
  type PortalProfileSocialPayload,
} from '@/lib/portal-profile-social';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const socialCache =
  createPortalRequestCache<PortalProfileSocialPayload>(30_000);

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Social graph query failed';
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request, 'accountId');
  const viewerAccountId = readAccountId(request, 'viewerAccountId');

  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  const cacheKey = `${accountId}|${viewerAccountId ?? ''}`;

  try {
    const response = await socialCache.getOrLoad(cacheKey, async () => {
      const os = createPortalServerOnSocialClient();
      return loadPortalProfileSocial(os, accountId, viewerAccountId);
    });

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : isRateLimitError(error)
            ? 'Social graph is busy — try again shortly'
            : 'Social graph query failed',
        detail,
      },
      { status: missingKey ? 503 : isRateLimitError(error) ? 429 : 502 }
    );
  }
}
