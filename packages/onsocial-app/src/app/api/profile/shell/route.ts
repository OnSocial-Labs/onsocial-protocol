import { NextRequest, NextResponse } from 'next/server';
import { displayName } from '@/lib/profile-display';
import { loadProfileShell } from '@/lib/profile-shell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return null;
  }
  return accountId;
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'Valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const shell = await loadProfileShell(accountId);
    return NextResponse.json({
      accountId,
      displayName: displayName(accountId, shell?.name ?? undefined),
      avatarUrl: shell?.avatarUrl ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: 'Profile shell lookup failed' },
      { status: 502 }
    );
  }
}
