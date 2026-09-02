import { NextRequest, NextResponse } from 'next/server';
import { loadProfileShell } from '@/lib/profile-shell';
import { fetchPageConfigFromChain } from '@/lib/read-page-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return null;
  }
  return accountId;
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'Valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const [shell, pageConfig] = await Promise.all([
      loadProfileShell(accountId),
      fetchPageConfigFromChain(accountId),
    ]);
    return NextResponse.json({
      accountId,
      hasProfile: Boolean(shell?.name?.trim()),
      name: shell?.name ?? '',
      location: shell?.location ?? '',
      kind: shell?.kind ?? null,
      bio: shell?.bio ?? '',
      avatarUrl: shell?.avatarUrl ?? null,
      bannerUrl: shell?.bannerUrl ?? null,
      bannerMedia: shell?.bannerMedia ?? null,
      links: shell?.links ?? null,
      pageConfig,
    });
  } catch {
    return NextResponse.json(
      { error: 'Profile editor lookup failed' },
      { status: 502 }
    );
  }
}
