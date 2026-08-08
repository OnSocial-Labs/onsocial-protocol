import { NextRequest, NextResponse } from 'next/server';
import { fetchDaoRoleLabels } from '@/lib/fetch-page-drawer-meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return NextResponse.json(
      { error: 'Invalid accountId' },
      { status: 400 }
    );
  }

  try {
    const daoRoleLabels = await fetchDaoRoleLabels(accountId);
    return NextResponse.json({ accountId, daoRoleLabels });
  } catch {
    return NextResponse.json(
      { error: 'DAO roles unavailable', daoRoleLabels: [] },
      { status: 502 }
    );
  }
}
