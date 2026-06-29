import { NextRequest, NextResponse } from 'next/server';
import { loadDiscoverProfilesPage } from '@/lib/discover-profiles-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 24;
const MAX_OFFSET = 10_000;
const MAX_QUERY_LENGTH = 80;

function getQuery(request: NextRequest): string {
  return (request.nextUrl.searchParams.get('q') ?? '')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function getLimit(request: NextRequest): number {
  const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(rawLimit));
}

function getOffset(request: NextRequest): number {
  const rawOffset = Number(request.nextUrl.searchParams.get('offset'));
  if (!Number.isFinite(rawOffset) || rawOffset < 0) return 0;
  return Math.min(MAX_OFFSET, Math.floor(rawOffset));
}

function getViewerAccountId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('viewerAccountId')?.trim() || null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Discover failed';
}

export async function GET(request: NextRequest) {
  const query = getQuery(request);
  const limit = getLimit(request);
  const offset = getOffset(request);
  const viewerAccountId = getViewerAccountId(request);

  try {
    const response = await loadDiscoverProfilesPage(
      query,
      viewerAccountId,
      offset,
      limit
    );

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');
    return NextResponse.json(
      {
        error: missingKey
          ? 'Server API key is not configured'
          : 'Discover failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
