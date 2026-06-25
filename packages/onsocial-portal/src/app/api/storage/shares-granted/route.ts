import { NextRequest, NextResponse } from 'next/server';
import { loadPortalStorageSharesGranted } from '@/lib/portal-storage-shares-granted';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHARES_GRANTED_CACHE_TTL_MS = 30_000;
const sharesGrantedCache = createPortalRequestCache(
  SHARES_GRANTED_CACHE_TTL_MS
);

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readPoolOwnerId(request: NextRequest): string | null {
  const poolOwnerId = request.nextUrl.searchParams.get('poolOwnerId')?.trim();
  if (!poolOwnerId) return null;
  if (!ACCOUNT_ID_PATTERN.test(poolOwnerId)) return null;
  return poolOwnerId;
}

function wantsFresh(request: NextRequest): boolean {
  const fresh = request.nextUrl.searchParams.get('fresh')?.trim();
  return fresh === '1' || fresh === 'true';
}

function readIncludeTargets(request: NextRequest): string[] {
  const raw = request.nextUrl.searchParams.get('includeTargets')?.trim();
  if (!raw) return [];

  return raw
    .split(',')
    .map((targetId) => targetId.trim())
    .filter((targetId) => ACCOUNT_ID_PATTERN.test(targetId));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Active shares query failed';
}

export async function GET(request: NextRequest) {
  const poolOwnerId = readPoolOwnerId(request);
  if (!poolOwnerId) {
    return NextResponse.json(
      { error: 'A valid poolOwnerId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const includeTargetIds = readIncludeTargets(request);
    const load = () =>
      loadPortalStorageSharesGranted(poolOwnerId, { includeTargetIds });

    const response = wantsFresh(request)
      ? await load()
      : await sharesGrantedCache.getOrLoad(
          `${poolOwnerId}:${includeTargetIds.join(',')}`,
          load
        );

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'Active shares lookup is busy — try again shortly'
          : 'Active shares unavailable right now',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
