import { NextResponse } from 'next/server';

import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';
import type { PortalSwapInputKind } from '@/lib/portal-swap-config';
import { estimatePortalSwap } from '@/server/ref-swap';

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
    };
    const kind = parseKind(body.kind);
    const amountIn =
      typeof body.amountIn === 'string' ? body.amountIn.trim() : '';

    if (!kind || !amountIn) {
      return NextResponse.json(
        { success: false, error: 'kind and amountIn are required.' },
        { status: 400 }
      );
    }

    const result = await estimatePortalSwap({ kind, amountIn });
    return NextResponse.json({
      success: true,
      amountOut: result.amountOut,
      amountOutYocto: result.amountOutYocto,
      quote: result.quote,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Estimate failed.',
      },
      { status: 500 }
    );
  }
}
