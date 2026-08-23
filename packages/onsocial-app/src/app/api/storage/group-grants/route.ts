import { NextRequest, NextResponse } from 'next/server';
import { loadAppGroupStorageGrants } from '@/lib/app-group-storage-grants';
import { isValidNearAccountId } from '@/lib/app-near-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readGroupId(request: NextRequest): string | null {
  const groupId = request.nextUrl.searchParams.get('groupId')?.trim();
  if (!groupId) return null;
  return groupId;
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
  return 'Guild storage grants query failed';
}

export async function GET(request: NextRequest) {
  const groupId = readGroupId(request);
  if (!groupId) {
    return NextResponse.json(
      { error: 'A groupId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const response = await loadAppGroupStorageGrants(groupId, {
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
        error: 'Guild storage grants unavailable right now',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
