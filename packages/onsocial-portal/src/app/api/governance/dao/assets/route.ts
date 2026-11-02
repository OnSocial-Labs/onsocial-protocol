import { NextRequest, NextResponse } from 'next/server';
import { loadDaoTransferAssets } from '@/lib/dao-transfer-assets';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const assets = await loadDaoTransferAssets(daoAccountId);

    return NextResponse.json(
      { assets },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'DAO assets unavailable';

    return NextResponse.json(
      {
        error: detail.includes('Invalid daoAccountId')
          ? detail
          : 'DAO assets unavailable',
        detail,
        assets: [],
      },
      {
        status: detail.includes('Invalid daoAccountId') ? 400 : 502,
      }
    );
  }
}
