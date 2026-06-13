import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { loadPortalProfileCore } from '@/lib/portal-profile-core';
import { loadPortalProfileSocial } from '@/lib/portal-profile-social';
import type { PortalProfileCorePayload } from '@/lib/portal-profile-core';
import { loadPortalProfileSignals } from '@/lib/portal-profile-signals';
import type { PortalProfileSignalsPayload } from '@/lib/portal-profile-signals';
import type { PortalProfileSocialPayload } from '@/lib/portal-profile-social';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILE_CORE_CACHE_TTL_MS = 45_000;
const PROFILE_BUNDLE_CACHE_TTL_MS = 30_000;

const profileCoreCache = createPortalRequestCache<
  Awaited<ReturnType<typeof loadPortalProfileCore>>
>(PROFILE_CORE_CACHE_TTL_MS);

type ProfileApiResponse = PortalProfileCorePayload & {
  social?: PortalProfileSocialPayload;
  signals?: PortalProfileSignalsPayload;
};

const profileBundleCache = createPortalRequestCache<ProfileApiResponse>(
  PROFILE_BUNDLE_CACHE_TTL_MS
);

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

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

interface ProfileBundleParts {
  social: boolean;
  signals: boolean;
}

function getBundleParts(request: NextRequest): ProfileBundleParts {
  const bundle = request.nextUrl.searchParams.get('bundle')?.trim() ?? '';
  return {
    social: bundle.includes('social'),
    signals: bundle.includes('signals'),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile query failed';
}

function cacheHeaders(maxAgeSeconds: number): HeadersInit {
  return {
    'Cache-Control': `private, max-age=${maxAgeSeconds}, stale-while-revalidate=60`,
  };
}

async function loadProfileBundle(
  accountId: string,
  viewerAccountId: string | null,
  parts: ProfileBundleParts
) {
  const cacheKey = `${accountId}|${viewerAccountId ?? ''}|${parts.social ? 's' : ''}${parts.signals ? 'g' : ''}`;

  return profileBundleCache.getOrLoad(cacheKey, async () => {
    const os = createPortalServerOnSocialClient();
    const core = await profileCoreCache.getOrLoad(accountId, () =>
      loadPortalProfileCore(os, accountId)
    );

    if (!parts.social && !parts.signals) {
      return core;
    }

    const [social, signals] = await Promise.all([
      parts.social
        ? loadPortalProfileSocial(os, accountId, viewerAccountId)
        : Promise.resolve(undefined),
      parts.signals
        ? loadPortalProfileSignals(accountId)
        : Promise.resolve(undefined),
    ]);

    return {
      ...core,
      ...(social ? { social } : {}),
      ...(signals ? { signals } : {}),
    };
  });
}

export async function GET(request: NextRequest) {
  const accountId = getAccountId(request);
  const viewerAccountId = getViewerAccountId(request);
  const parts = getBundleParts(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const response = await loadProfileBundle(accountId, viewerAccountId, parts);

    return NextResponse.json(response, {
      headers: cacheHeaders(parts.social || parts.signals ? 30 : 45),
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : isRateLimitError(error)
            ? 'Profile service is busy — try again shortly'
            : 'Profile query failed',
        detail,
      },
      {
        status: missingKey ? 503 : isRateLimitError(error) ? 429 : 502,
      }
    );
  }
}
