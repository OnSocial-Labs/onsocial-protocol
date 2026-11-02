import { NextRequest, NextResponse } from 'next/server';
import { createRequestOnSocialClient } from '@/lib/portal-request-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accountId = (request.nextUrl.searchParams.get('accountId') ?? '')
    .trim()
    .slice(0, 64);
  if (!accountId) {
    return NextResponse.json({ jobs: [] }, { status: 400 });
  }
  const includeClosed =
    request.nextUrl.searchParams.get('includeClosed') === '1' ||
    request.nextUrl.searchParams.get('includeClosed') === 'true';

  try {
    const os = await createRequestOnSocialClient();
    const jobs = await os.query.jobs.forAccount(accountId, { includeClosed });
    return NextResponse.json(
      { jobs },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ jobs: [] }, { status: 502 });
  }
}
