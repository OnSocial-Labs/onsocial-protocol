import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accountId = (request.nextUrl.searchParams.get('accountId') ?? '')
    .trim()
    .slice(0, 64);
  if (!accountId) {
    return NextResponse.json({ jobs: [] }, { status: 400 });
  }

  try {
    const os = createPortalServerOnSocialClient();
    const jobs = await os.query.jobs.openForAccount(accountId);
    return NextResponse.json(
      { jobs },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ jobs: [] }, { status: 502 });
  }
}
