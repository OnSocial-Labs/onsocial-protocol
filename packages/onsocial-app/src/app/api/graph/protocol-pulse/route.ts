import { NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVALIDATE_SECONDS = 60;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export async function GET() {
  try {
    const os = createServerOnSocialClient();
    const pulse = await os.query.stats.protocolPulse();

    return NextResponse.json(pulse, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey =
      detail.includes('ONSOCIAL_API_KEY') ||
      detail.includes('cannot create a server-side OnSocial client');

    return NextResponse.json(
      {
        error: missingKey
          ? 'OnAPI key is not configured'
          : 'Failed to fetch protocol pulse',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
