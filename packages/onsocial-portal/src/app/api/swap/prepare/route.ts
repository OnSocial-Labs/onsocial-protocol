import { NextResponse } from 'next/server';

import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';
import type { PortalSwapInputKind } from '@/lib/portal-swap-config';
import { preparePortalSwapTransactions } from '@/server/ref-swap';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function parseKind(value: unknown): PortalSwapInputKind | null {
  return value === 'near' || value === 'usdc' ? value : null;
}

export async function POST(request: Request) {
  if (!PORTAL_SWAP_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Swap is only available on mainnet.' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as {
      kind?: unknown;
      amountIn?: unknown;
      accountId?: unknown;
    };
    const kind = parseKind(body.kind);
    const amountIn =
      typeof body.amountIn === 'string' ? body.amountIn.trim() : '';
    const accountId =
      typeof body.accountId === 'string'
        ? body.accountId.trim().toLowerCase()
        : '';

    if (!kind || !amountIn || !ACCOUNT_ID_PATTERN.test(accountId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'kind, amountIn, and accountId are required.',
        },
        { status: 400 }
      );
    }

    const transactions = await preparePortalSwapTransactions({
      kind,
      amountIn,
      accountId,
    });

    return NextResponse.json({ success: true, transactions });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Prepare failed.',
      },
      { status: 500 }
    );
  }
}
