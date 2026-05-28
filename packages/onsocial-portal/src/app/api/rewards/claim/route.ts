import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function getRewardsApiKey(): string | undefined {
  const key = process.env.ONSOCIAL_PORTAL_REWARDS_API_KEY?.trim();
  return key || undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  const apiKey = getRewardsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Portal rewards API key is not configured' },
      { status: 503 }
    );
  }

  let body: { account_id?: unknown };
  try {
    body = (await request.json()) as { account_id?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const accountId =
    typeof body.account_id === 'string'
      ? body.account_id.trim().toLowerCase()
      : '';
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    return NextResponse.json(
      { success: false, error: 'account_id is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${ACTIVE_BACKEND_URL}/v1/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      cache: 'no-store',
      body: JSON.stringify({ account_id: accountId }),
    });

    const data = (await response.json().catch(() => ({}))) as unknown;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Reward claim request failed',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
