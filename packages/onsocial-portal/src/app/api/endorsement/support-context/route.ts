import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortalEndorsementSupportContext,
  type PortalEndorsementSupportContext,
} from '@/lib/portal-endorsement-support-context';
import { normalizeEndorsementSupportId } from '@/lib/portal-endorsement-support-total';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTEXT_CACHE_TTL_MS = 30_000;

function cacheKey(
  endorsementId: string,
  issuer: string,
  target: string,
  topic: string
): string {
  return `${endorsementId}:${issuer}:${target}:${topic}`;
}

const contextCache =
  createPortalRequestCache<PortalEndorsementSupportContext>(
    CONTEXT_CACHE_TTL_MS
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
  return 'Endorsement support context query failed';
}

export async function GET(request: NextRequest) {
  const endorsementId = readEndorsementId(request);
  if (!endorsementId) {
    return NextResponse.json(
      { error: 'A valid endorsementId query parameter is required' },
      { status: 400 }
    );
  }

  const issuer = request.nextUrl.searchParams.get('issuer')?.trim() ?? '';
  const target = request.nextUrl.searchParams.get('target')?.trim() ?? '';
  const topic = request.nextUrl.searchParams.get('topic')?.trim() ?? '';
  const key = cacheKey(endorsementId, issuer, target, topic);

  try {
    const response = wantsFresh(request)
      ? await loadPortalEndorsementSupportContext({
          endorsementId,
          issuer,
          target,
          topic,
        })
      : await contextCache.getOrLoad(key, () =>
          loadPortalEndorsementSupportContext({
            endorsementId,
            issuer,
            target,
            topic,
          })
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
          ? 'Support context lookup is busy — try again shortly'
          : 'Endorsement support context query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
