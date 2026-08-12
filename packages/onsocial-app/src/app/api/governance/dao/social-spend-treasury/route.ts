import { NextRequest, NextResponse } from 'next/server';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/app-config';
import { loadProtocolDaoSocialSpendTreasuryContext } from '@/lib/protocol-dao-social-spend-treasury';

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
    const context =
      await loadProtocolDaoSocialSpendTreasuryContext(daoAccountId);

    return NextResponse.json(
      { context },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
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
