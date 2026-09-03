import { NextRequest, NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACCOUNT_LENGTH = 64;

export async function GET(request: NextRequest) {
  const accountId = (request.nextUrl.searchParams.get('accountId') ?? '')
    .trim()
    .slice(0, MAX_ACCOUNT_LENGTH);
  if (!accountId) {
    return NextResponse.json({ jobs: [] }, { status: 400 });
  }

  try {
    const os = createServerOnSocialClient();
    const jobs = await os.query.jobs.openForAccount(accountId);
    return NextResponse.json(
      { jobs },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Jobs failed';
    const missingKey = detail.includes('ONSOCIAL_API_KEY');
    return NextResponse.json(
      {
        error: missingKey
          ? 'Server API key is not configured'
          : 'Jobs failed',
        jobs: [],
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
