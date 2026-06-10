import { NextRequest, NextResponse } from 'next/server';
import { loadDaoTransferAssets } from '@/lib/dao-transfer-assets';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAO_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readDaoAccountId(request: NextRequest): string {
  const daoAccountId =
    request.nextUrl.searchParams.get('daoAccountId')?.trim() ||
    GOVERNANCE_DAO_ACCOUNT;
  if (!DAO_ACCOUNT_PATTERN.test(daoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }
  return daoAccountId;
}

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = readDaoAccountId(request);
    const assets = await loadDaoTransferAssets(daoAccountId);

    return NextResponse.json(
      { assets },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
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
