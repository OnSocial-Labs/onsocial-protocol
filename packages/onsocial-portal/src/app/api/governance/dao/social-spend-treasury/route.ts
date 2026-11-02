import { NextRequest, NextResponse } from 'next/server';
import { loadDaoSocialSpendTreasuryContext } from '@/lib/dao-social-spend-treasury';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const context = await loadDaoSocialSpendTreasuryContext(daoAccountId);

    return NextResponse.json(
      { context },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : 'Social spend treasury context unavailable';

    return NextResponse.json(
      {
        error: detail.includes('Invalid daoAccountId')
          ? detail
          : 'Social spend treasury context unavailable',
        detail,
        context: null,
      },
      {
        status: detail.includes('Invalid daoAccountId') ? 400 : 502,
      }
    );
  }
}
