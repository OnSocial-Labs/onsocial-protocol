import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import {
  portalPrivateCacheControl,
  portalPublicCacheControl,
  PORTAL_NETWORK_SAMPLE_REVALIDATE_SECONDS,
  PORTAL_NETWORK_SEARCH_REVALIDATE_SECONDS,
} from '@/lib/portal-api-cache';
import {
  loadPortalProfileNetwork,
  type PortalProfileNetworkLoadOptions,
} from '@/lib/portal-profile-network';

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Network graph query failed';
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

  const searchQuery = request.nextUrl.searchParams.get('q');
  const filter = request.nextUrl.searchParams.get('filter');
  const loadOptions: PortalProfileNetworkLoadOptions = {};
  if (searchQuery != null) loadOptions.searchQuery = searchQuery;
  if (filter != null) loadOptions.filter = filter;

  const normalizedSearch = normalizeProfileSearchQuery(searchQuery);
  const isSearch = isProfileSearchQuery(normalizedSearch);

  try {
    const os = createPortalServerOnSocialClient();
    const response = await loadPortalProfileNetwork(
      os,
      accountId,
      viewerAccountId,
      loadOptions
    );

    const cacheControl = isSearch
      ? portalPrivateCacheControl(
          PORTAL_NETWORK_SEARCH_REVALIDATE_SECONDS,
          PORTAL_NETWORK_SEARCH_REVALIDATE_SECONDS * 2
        )
      : portalPublicCacheControl(PORTAL_NETWORK_SAMPLE_REVALIDATE_SECONDS);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': cacheControl },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Network graph query failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
