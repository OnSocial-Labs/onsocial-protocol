import { NextRequest, NextResponse } from 'next/server';
import {
  isPortalSeasonAdmin,
  normalizeSeasonAdminAccountId,
} from '@/lib/portal-season-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accountId = normalizeSeasonAdminAccountId(
    request.nextUrl.searchParams.get('account_id')
  );

  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'account_id is required' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    accountId,
    allowed: isPortalSeasonAdmin(accountId),
  });
}
