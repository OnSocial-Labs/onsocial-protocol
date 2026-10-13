import { NextRequest, NextResponse } from 'next/server';
import type { OfferRecord } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACCOUNT_LENGTH = 64;
const MAX_BATCH = 40;

function accountIdOk(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ACCOUNT_LENGTH &&
    !value.includes(' ')
  );
}

export async function GET(request: NextRequest) {
  const single = (request.nextUrl.searchParams.get('accountId') ?? '').trim();
  const batch = (request.nextUrl.searchParams.get('accountIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(accountIdOk)
    .slice(0, MAX_BATCH);

  if (!single && batch.length === 0) {
    return NextResponse.json({ offers: [], counts: {} }, { status: 400 });
  }

  try {
    const os = createServerOnSocialClient();
    if (single) {
      if (!accountIdOk(single)) {
        return NextResponse.json({ offers: [] }, { status: 400 });
      }
      const offers = await os.offers.list(single);
      return NextResponse.json(
        { offers },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const counts: Record<string, number> = {};
    const queue = [...batch];
    const workers = Array.from(
      { length: Math.min(6, queue.length) },
      async () => {
        while (queue.length > 0) {
          const accountId = queue.shift();
          if (!accountId) return;
          try {
            const offers = await os.offers.list(accountId);
            if (offers.length > 0) counts[accountId] = offers.length;
          } catch {
            // One account missing offers should not blank the row list.
          }
        }
      }
    );
    await Promise.all(workers);
    return NextResponse.json(
      { counts },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Offers failed';
    const missingKey = detail.includes('ONSOCIAL_API_KEY');
    const empty: { offers: OfferRecord[]; counts: Record<string, number> } = {
      offers: [],
      counts: {},
    };
    return NextResponse.json(
      {
        error: missingKey
          ? 'Server API key is not configured'
          : 'Offers failed',
        ...empty,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
