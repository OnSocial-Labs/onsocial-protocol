import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  loadLiveCtaPayload,
  loadPersonalRewards,
  type LiveCtaPayload,
} from '@/lib/portal-live-cta-server';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NETWORK_CACHE_TTL_MS = 60_000;
const PERSONAL_CACHE_TTL_MS = 30_000;

const networkCache =
  createPortalRequestCache<Pick<LiveCtaPayload, 'boost' | 'rewards'>>(
    NETWORK_CACHE_TTL_MS
  );

const personalCache = createPortalRequestCache<LiveCtaPayload['personal']>(
  PERSONAL_CACHE_TTL_MS
);

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Live section query failed';
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);

  try {
    const os = createPortalServerOnSocialClient();
    const network = await networkCache.getOrLoad('network', async () => {
      const payload = await loadLiveCtaPayload(os, null);
      return { boost: payload.boost, rewards: payload.rewards };
    });

    const personal = accountId
      ? await personalCache.getOrLoad(accountId, () =>
          loadPersonalRewards(os, accountId)
        )
      : null;

    const response: LiveCtaPayload = {
      boost: network.boost,
      rewards: network.rewards,
      personal,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': accountId
          ? 'private, max-age=30, stale-while-revalidate=60'
          : 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'Live stats are busy — try again shortly'
          : 'Live section query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
