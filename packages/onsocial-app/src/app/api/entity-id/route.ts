import { NextRequest, NextResponse } from 'next/server';
import { fetchApp } from '@/features/scarces/apps-data';
import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { viewNearContract } from '@/lib/app-near-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin id probe for create forms (hub / guild).
 * Server-side contract views — avoids browser Near-RPC BFF / OnAPI quirks.
 */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind');
  const id = request.nextUrl.searchParams.get('id')?.trim() ?? '';

  if (!id || (kind !== 'hub' && kind !== 'guild')) {
    return NextResponse.json({ error: 'Invalid kind or id' }, { status: 400 });
  }

  try {
    if (kind === 'hub') {
      const app = await fetchApp(id);
      return NextResponse.json({ taken: app != null });
    }

    const config = await viewNearContract<Record<string, unknown> | null>(
      CORE_CONTRACT,
      'get_group_config',
      { group_id: id }
    );
    return NextResponse.json({ taken: config != null });
  } catch {
    // Soft — create can still attempt on-chain.
    return NextResponse.json({ taken: false, uncertain: true });
  }
}
