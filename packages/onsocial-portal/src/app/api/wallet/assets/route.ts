import { NextRequest, NextResponse } from 'next/server';
import {
  getSocialWalletBalanceYocto,
  getSpendableNearBalance,
  viewAccount,
} from '@/lib/near-rpc';
import { getSocialTokenMetadata } from '@/lib/token-metadata';

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
    const [nearAccount, socialBalanceYocto, socialMeta] = await Promise.all([
      viewAccount(accountId),
      getSocialWalletBalanceYocto(accountId),
      getSocialTokenMetadata(),
    ]);

    return NextResponse.json({
      nearBalanceYocto: getSpendableNearBalance(nearAccount),
      socialBalanceYocto: socialBalanceYocto.toString(),
      social: {
        symbol: socialMeta.symbol,
        name: socialMeta.name,
        icon: socialMeta.icon,
        decimals: socialMeta.decimals,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Assets unavailable';
    return NextResponse.json(
      { error: 'Assets unavailable', detail },
      { status: 502 }
    );
  }
}
