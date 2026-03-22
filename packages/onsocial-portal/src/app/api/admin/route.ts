import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_PROXY_BACKEND_URL,
  ADMIN_SECRET,
  isAdminWallet,
} from '@/lib/portal-server-config';

// ---------------------------------------------------------------------------
// Server-side admin API proxy
// ---------------------------------------------------------------------------
// Injects ADMIN_SECRET from server env so it never touches the browser.
// The portal admin page calls this route instead of the backend directly.
// ---------------------------------------------------------------------------


function isAdmin(wallet: string | null): boolean {
  return isAdminWallet(wallet);
}

// GET /api/admin?wallet=xxx — list applications
// GET /api/admin?wallet=xxx&action=status&target=walletId — check status
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  const action = req.nextUrl.searchParams.get('action');
  const target = req.nextUrl.searchParams.get('target');

  if (!isAdmin(wallet)) {
    return NextResponse.json(
      { success: false, error: 'Access denied' },
      { status: 403 }
    );
  }

  try {
    if (action === 'status' && target) {
      const res = await fetch(`${ADMIN_PROXY_BACKEND_URL}/v1/admin/status/${target}`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Default: list applications
    const res = await fetch(`${ADMIN_PROXY_BACKEND_URL}/v1/admin/applications`, {
      headers: { 'X-Admin-Secret': ADMIN_SECRET },
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: 'Backend request failed' },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Backend unreachable' },
      { status: 502 }
    );
  }
}

// POST /api/admin — approve, reject, or reopen
// Body: { wallet, action: 'approve' | 'reject' | 'reopen', appId, admin_notes? }
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    wallet?: string;
    action?: string;
    appId?: string;
    admin_notes?: string;
  };

  if (!isAdmin(body.wallet ?? null)) {
    return NextResponse.json(
      { success: false, error: 'Access denied' },
      { status: 403 }
    );
  }

  if (!body.action || !body.appId) {
    return NextResponse.json(
      { success: false, error: 'action and appId required' },
      { status: 400 }
    );
  }

  if (
    body.action !== 'approve' &&
    body.action !== 'reject' &&
    body.action !== 'reopen'
  ) {
    return NextResponse.json(
      { success: false, error: 'action must be approve, reject, or reopen' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${ADMIN_PROXY_BACKEND_URL}/v1/admin/${body.action}/${body.appId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': ADMIN_SECRET,
      },
      body: JSON.stringify({ admin_notes: body.admin_notes ?? '' }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed',
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Backend unreachable' },
      { status: 502 }
    );
  }
}
