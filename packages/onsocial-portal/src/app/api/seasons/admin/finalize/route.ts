import { NextRequest, NextResponse } from 'next/server';
import {
  forwardSeasonAdminRequest,
  isPortalSeasonAdmin,
  normalizeSeasonAdminAccountId,
} from '@/lib/portal-season-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { accountId?: unknown; cutoffTimestampNs?: unknown };
  try {
    body = (await request.json()) as {
      accountId?: unknown;
      cutoffTimestampNs?: unknown;
    };
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const accountId = normalizeSeasonAdminAccountId(
    typeof body.accountId === 'string' ? body.accountId : null
  );
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'A valid accountId is required' },
      { status: 400 }
    );
  }

  if (!isPortalSeasonAdmin(accountId)) {
    return NextResponse.json(
      { success: false, error: 'This wallet is not a season settlement admin' },
      { status: 403 }
    );
  }

  const payload: Record<string, unknown> = {};
  if (
    typeof body.cutoffTimestampNs === 'string' &&
    body.cutoffTimestampNs.trim()
  ) {
    payload.cutoffTimestampNs = body.cutoffTimestampNs.trim();
  }

  const upstream = await forwardSeasonAdminRequest(
    'season-zero/finalize',
    payload
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
