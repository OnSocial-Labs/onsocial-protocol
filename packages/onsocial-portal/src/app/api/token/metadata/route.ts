import { NextResponse } from 'next/server';
import {
  getSocialTokenMetadata,
  type FtTokenMetadata,
} from '@/lib/token-metadata';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METADATA_CACHE_TTL_MS = 300_000;
const metadataCache = createPortalRequestCache<FtTokenMetadata>(
  METADATA_CACHE_TTL_MS
);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Token metadata query failed';
}

export async function GET() {
  try {
    const metadata = await metadataCache.getOrLoad('social', () =>
      getSocialTokenMetadata()
    );

    return NextResponse.json(
      { metadata },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'Token metadata lookup is busy — try again shortly'
          : 'Token metadata query failed',
        detail,
      },
      { status: isRateLimitError(error) ? 429 : 502 }
    );
  }
}
