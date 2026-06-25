import { NextRequest, NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 24;
const MAX_QUERY_LENGTH = 80;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const viewerAccountId = params.get('viewerAccountId')?.trim() || undefined;
  const rawLimit = Number(params.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_LIMIT, Math.floor(rawLimit))
      : MAX_LIMIT;

  try {
    const os = createServerOnSocialClient();
    const page = await os.query.profiles.discoverPage({
      query: query || undefined,
      limit,
      viewerAccountId,
    });

    const profiles = page.profiles.map((row) => ({
      accountId: row.accountId,
      name: row.name,
      bio: row.bio,
      avatar: row.avatar,
      standingCount: row.standingCount,
      endorsementsReceivedCount: row.endorsementsReceivedCount,
    }));

    return NextResponse.json(
      { profiles },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');
    return NextResponse.json(
      {
        error: missingKey
          ? 'Server API key is not configured'
          : 'Discover failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
