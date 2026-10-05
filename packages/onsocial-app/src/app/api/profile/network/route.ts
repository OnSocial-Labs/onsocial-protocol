import { NextRequest, NextResponse } from 'next/server';
import { loadProfileNetworkOrbit } from '@/lib/profile-network-server';
import { createAppOnSocialClient } from '@/lib/profile-social-server';

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
  return 'Network orbit query failed';
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

  try {
    const os = createAppOnSocialClient();
    const payload = await loadProfileNetworkOrbit(os, accountId, viewerAccountId, {
      searchQuery: request.nextUrl.searchParams.get('q'),
      filter: request.nextUrl.searchParams.get('filter'),
    });

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Network orbit query failed', detail: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
