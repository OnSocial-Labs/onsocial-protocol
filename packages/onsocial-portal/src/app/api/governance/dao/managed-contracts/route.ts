import { NextRequest, NextResponse } from 'next/server';
import { loadDaoManagedContracts } from '@/lib/dao-managed-contracts';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const contracts = await loadDaoManagedContracts(daoAccountId);

    return NextResponse.json(
      { contracts },
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
        : 'DAO managed contracts unavailable';

    return NextResponse.json(
      {
        error: detail.includes('Invalid daoAccountId')
          ? detail
          : 'DAO managed contracts unavailable',
        detail,
        contracts: [],
      },
      {
        status: detail.includes('Invalid daoAccountId') ? 400 : 502,
      }
    );
  }
}
