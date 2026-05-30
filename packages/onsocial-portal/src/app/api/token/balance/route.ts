import { NextRequest, NextResponse } from 'next/server';
import { getSocialWalletBalanceYocto } from '@/lib/near-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return NextResponse.json(
      {
        error: 'Invalid accountId',
        detail: 'Provide a valid NEAR account id.',
      },
      { status: 400 }
    );
  }

  try {
    const balanceYocto = await getSocialWalletBalanceYocto(accountId);
    return NextResponse.json({ balanceYocto: balanceYocto.toString() });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Balance unavailable';
    return NextResponse.json(
      { error: 'Balance unavailable', detail },
      { status: 502 }
    );
  }
}
