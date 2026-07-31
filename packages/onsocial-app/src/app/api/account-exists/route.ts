import { NextRequest, NextResponse } from 'next/server';
import {
  isNearAccountInputReady,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { viewAccount } from '@/lib/app-near-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin NEAR account probe for transfer / recipient fields.
 * Server-side `view_account` — mirrors `/api/entity-id` for create forms.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('accountId') ?? '';
  const accountId = normalizeNearAccountId(raw);

  if (!accountId || !isNearAccountInputReady(accountId)) {
    return NextResponse.json(
      { error: 'Invalid account id', exists: false },
      { status: 400 }
    );
  }

  try {
    const account = await viewAccount(accountId);
    return NextResponse.json({ exists: account != null });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message.toLowerCase() : '';
    // Missing accounts throw from RPC — treat as not found.
    if (
      message.includes('does not exist') ||
      message.includes('unknown account') ||
      message.includes('not found')
    ) {
      return NextResponse.json({ exists: false });
    }
    return NextResponse.json({ exists: false, uncertain: true });
  }
}
