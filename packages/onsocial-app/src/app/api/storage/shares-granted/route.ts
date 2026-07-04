import { NextRequest, NextResponse } from 'next/server';
import { loadAppStorageSharesGranted } from '@/lib/app-storage-shares-granted';
import { isValidNearAccountId } from '@/lib/app-near-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readPoolOwnerId(request: NextRequest): string | null {
  const poolOwnerId = request.nextUrl.searchParams.get('poolOwnerId')?.trim();
  if (!poolOwnerId || !isValidNearAccountId(poolOwnerId)) return null;
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
    .filter(isValidNearAccountId);
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
    const response = await loadAppStorageSharesGranted(poolOwnerId, {
      includeTargetIds: readIncludeTargets(request),
    });

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': wantsFresh(request)
          ? 'private, no-store'
          : 'private, max-age=15, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Active shares unavailable right now',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
