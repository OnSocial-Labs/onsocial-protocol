import { NextRequest, NextResponse } from 'next/server';
import { parsePortalNetwork } from '@/lib/portal-network';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';
import { loadProtocolPulse } from '@/lib/protocol-pulse-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export async function GET(request: NextRequest) {
  const network =
    parsePortalNetwork(request.nextUrl.searchParams.get('network')) ??
    (await getRequestPortalNetwork());
  try {
    const pulse = await loadProtocolPulse(network);
    if (!pulse) {
      return NextResponse.json(
        { error: 'Failed to fetch protocol pulse' },
        { status: 502 }
      );
    }

    return NextResponse.json(pulse, {
      headers: {
        'Cache-Control': 'private, no-store',
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
