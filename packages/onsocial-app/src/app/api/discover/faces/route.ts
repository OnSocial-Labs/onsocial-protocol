import { NextResponse } from 'next/server';
import { emptyDiscoverFaceCounts } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Face counts failed';
}

/** Discover face chip census (All / People / Orgs / DAOs / Offers / Hiring). */
export async function GET() {
  try {
    const os = createServerOnSocialClient();
    const counts = await os.query.profiles.faceCounts();
    return NextResponse.json(
      { counts },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');
    if (!missingKey) {
      return NextResponse.json(
        { counts: emptyDiscoverFaceCounts() },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      {
        error: 'Server API key is not configured',
        detail,
        counts: emptyDiscoverFaceCounts(),
      },
      { status: 503 }
    );
  }
}
