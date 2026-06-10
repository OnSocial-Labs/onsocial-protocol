import { NextRequest, NextResponse } from 'next/server';
import { getServerActiveSeasonId } from '@/lib/active-season';
import {
  forwardSeasonAdminRequest,
  isPortalSeasonAdmin,
  normalizeSeasonAdminAccountId,
} from '@/lib/portal-season-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { accountId?: unknown; active?: unknown };
  try {
    body = (await request.json()) as {
      accountId?: unknown;
      active?: unknown;
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

  const active = typeof body.active === 'boolean' ? body.active : true;
  const upstream = await forwardSeasonAdminRequest(
    `${getServerActiveSeasonId()}/settlement/publish`,
    { active }
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
