import { NextRequest, NextResponse } from 'next/server';
import {
  loadAppEndorsementSupportTotal,
  normalizeEndorsementSupportId,
} from '@/lib/app-endorsement-support-total';

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
    const data = await loadAppEndorsementSupportTotal(endorsementId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Endorsement support unavailable',
        detail:
          error instanceof Error
            ? error.message
            : 'Endorsement support query failed',
      },
      { status: 502 }
    );
  }
}
