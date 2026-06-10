import { NextRequest, NextResponse } from 'next/server';
import {
  forwardSeasonAdminGet,
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
      { success: false, error: 'A valid account_id is required' },
      { status: 400 }
    );
  }

  if (!isPortalSeasonAdmin(accountId)) {
    return NextResponse.json(
      { success: false, error: 'This wallet is not a season settlement admin' },
      { status: 403 }
    );
  }

  const cutoff = request.nextUrl.searchParams
    .get('cutoff_timestamp_ns')
    ?.trim();
  const search = cutoff
    ? `?cutoff_timestamp_ns=${encodeURIComponent(cutoff)}`
    : '';

  const upstream = await forwardSeasonAdminGet(
    'season-zero/finalize/preview',
    search
  );
  const text = await upstream.text();

  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
