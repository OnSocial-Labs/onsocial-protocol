import { NextResponse } from 'next/server';

import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';
import type { PortalSwapInputKind } from '@/lib/portal-swap-config';
import { getPortalSwapAccountBalances } from '@/server/ref-swap';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function parseKind(value: string | null): PortalSwapInputKind | null {
  return value === 'near' || value === 'usdc' ? value : null;
}

export async function GET(request: Request) {
  if (!PORTAL_SWAP_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Swap is only available on mainnet.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const accountId = (searchParams.get('accountId') ?? '').trim().toLowerCase();
  const kind = parseKind(searchParams.get('kind'));

  if (!ACCOUNT_ID_PATTERN.test(accountId) || !kind) {
    return NextResponse.json(
      { success: false, error: 'accountId and kind are required.' },
      { status: 400 }
    );
  }

  try {
    const balances = await getPortalSwapAccountBalances(accountId, kind);
    return NextResponse.json({
      success: true,
      balanceYocto: balances.inputBalanceYocto,
      nearBalanceYocto: balances.nearBalanceYocto,
      usdcBalanceYocto: balances.usdcBalanceYocto,
      totalNearBalanceYocto: balances.totalNearBalanceYocto,
      socialBalanceYocto: balances.socialBalanceYocto,
      needsWnearStorage: balances.needsWnearStorage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Balance unavailable.',
      },
      { status: 500 }
    );
  }
}
