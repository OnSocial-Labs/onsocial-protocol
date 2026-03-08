import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Server-side admin API proxy
// ---------------------------------------------------------------------------
// Injects ADMIN_SECRET from server env so it never touches the browser.
// The portal admin page calls this route instead of the backend directly.
// ---------------------------------------------------------------------------

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'https://backend.onsocial.id'

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? ''

const ADMIN_WALLETS = (
  process.env.NEXT_PUBLIC_ADMIN_WALLETS ??
    'onsocial.near,onsocial.testnet,greenghost.near,test01greenghost.testnet'
)
  .split(',')
  .map((w) => w.trim().toLowerCase())

function isAdmin(wallet: string | null): boolean {
  return !!wallet && ADMIN_WALLETS.includes(wallet.toLowerCase())
}

// GET /api/admin?wallet=xxx — list applications
// GET /api/admin?wallet=xxx&action=status&target=walletId — check status
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')
  const action = req.nextUrl.searchParams.get('action')
  const target = req.nextUrl.searchParams.get('target')

  if (!isAdmin(wallet)) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
  }

  try {
    if (action === 'status' && target) {
      const res = await fetch(`${BACKEND_URL}/v1/admin/status/${target}`)
      const data = await res.json()
      return NextResponse.json(data)
    }

    // Default: list applications
    const res = await fetch(`${BACKEND_URL}/v1/admin/applications`, {
      headers: { 'X-Admin-Secret': ADMIN_SECRET },
    })
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: 'Backend request failed' },
        { status: res.status },
      )
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { success: false, error: 'Backend unreachable' },
      { status: 502 },
    )
  }
}

// POST /api/admin — approve or reject
// Body: { wallet, action: 'approve' | 'reject', appId, admin_notes? }
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    wallet?: string
    action?: string
    appId?: string
    admin_notes?: string
  }

  if (!isAdmin(body.wallet ?? null)) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
  }

  if (!body.action || !body.appId) {
    return NextResponse.json(
      { success: false, error: 'action and appId required' },
      { status: 400 },
    )
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json(
      { success: false, error: 'action must be approve or reject' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/v1/admin/${body.action}/${body.appId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ admin_notes: body.admin_notes ?? '' }),
      },
    )

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json(
        { success: false, error: (data as { error?: string }).error ?? 'Failed' },
        { status: res.status },
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { success: false, error: 'Backend unreachable' },
      { status: 502 },
    )
  }
}
