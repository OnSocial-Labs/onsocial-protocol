import { NextRequest, NextResponse } from 'next/server';
import { loadDaoBoostInfraContext } from '@/lib/dao-boost-infra';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const context = await loadDaoBoostInfraContext(daoAccountId);

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
        : 'Boost infra context unavailable';

    return NextResponse.json(
      {
        error: detail.includes('Invalid daoAccountId')
          ? detail
          : 'Boost infra context unavailable',
        detail,
        context: null,
      },
      {
        status: detail.includes('Invalid daoAccountId') ? 400 : 502,
      }
    );
  }
}
