import { NextRequest, NextResponse } from 'next/server';
import { SOCIAL_SPEND_CONTRACT } from '@/lib/app-config';
import {
  normalizeFtBalanceYocto,
  viewNearContract,
} from '@/lib/app-near-rpc';

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
    const raw = await viewNearContract<unknown>(
      SOCIAL_SPEND_CONTRACT,
      'get_target_balance',
      { account_id: accountId }
    );
    return NextResponse.json({
      balanceYocto: normalizeFtBalanceYocto(raw).toString(),
    });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : 'Support balance unavailable';
    return NextResponse.json(
      { error: 'Support balance unavailable', detail },
      { status: 502 }
    );
  }
}
