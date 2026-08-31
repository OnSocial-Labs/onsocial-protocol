import { NextRequest, NextResponse } from 'next/server';
import { loadAppEndorsementSupporters } from '@/lib/app-endorsement-supporters';
import { normalizeEndorsementSupportId } from '@/lib/app-endorsement-support-total';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const endorsementId = normalizeEndorsementSupportId(
    request.nextUrl.searchParams.get('endorsementId') ?? ''
  );
  if (!endorsementId) {
    return NextResponse.json(
      {
        error: 'Invalid endorsementId',
        detail: 'Provide a valid endorsement id.',
      },
      { status: 400 }
    );
  }

  try {
    const data = await loadAppEndorsementSupporters(endorsementId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Endorsement supporters unavailable',
        detail:
          error instanceof Error
            ? error.message
            : 'Endorsement supporters query failed',
      },
      { status: 502 }
    );
  }
}
