import { NextRequest, NextResponse } from 'next/server';
import {
  isNearAccountInputReady,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { discoverCreatorTokens } from '@/lib/discover-creator-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accountId = normalizeNearAccountId(
    request.nextUrl.searchParams.get('accountId') ?? ''
  );
  if (!accountId || !isNearAccountInputReady(accountId)) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const tokens = await discoverCreatorTokens(accountId);
    return NextResponse.json(
      { accountId, tokens },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'Discover failed';
    return NextResponse.json(
      { error: 'Could not look up tokens you already have.', detail },
      { status: 500 }
    );
  }
}
