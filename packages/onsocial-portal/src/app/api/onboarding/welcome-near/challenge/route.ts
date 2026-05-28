import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

export async function POST(request: NextRequest) {
  let body: { account_id?: unknown };
  try {
    body = (await request.json()) as { account_id?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const accountId = normalizeAccountId(body.account_id);
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'account_id is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${ACTIVE_BACKEND_URL}/v1/portal/welcome-near/challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ account_id: accountId }),
      }
    );
    const data = (await response.json().catch(() => ({}))) as unknown;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Welcome NEAR challenge request failed',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
