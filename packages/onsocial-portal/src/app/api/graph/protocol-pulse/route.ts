import { NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { PROTOCOL_PULSE_REVALIDATE_SECONDS } from '@/lib/protocol-pulse-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export async function GET() {
  try {
    const os = createPortalServerOnSocialClient();
    const pulse = await os.query.stats.protocolPulse();

    return NextResponse.json(pulse, {
      headers: {
        'Cache-Control': `public, s-maxage=${PROTOCOL_PULSE_REVALIDATE_SECONDS}, stale-while-revalidate=${PROTOCOL_PULSE_REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey =
      detail.includes('ONSOCIAL_API_KEY') ||
      detail.includes('OnAPI key is not configured');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Failed to fetch protocol pulse',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
