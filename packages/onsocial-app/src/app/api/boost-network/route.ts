import { NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVALIDATE_SECONDS = 30;

type BoostNetworkSnapshot = {
  boosterCount: number;
};

type AggregateCountNode = {
  aggregate?: { count?: number | null } | null;
};

function readAggregateCount(
  node: AggregateCountNode | null | undefined
): number {
  const count = node?.aggregate?.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

export async function GET() {
  try {
    const os = createServerOnSocialClient();
    const res = await os.query.graphql<{
      leaderboardBoostAggregate?: AggregateCountNode | null;
    }>({
      query: `{
        leaderboardBoostAggregate {
          aggregate { count }
        }
      }`,
    });

    const boosterCount = readAggregateCount(
      res.data?.leaderboardBoostAggregate
    );
    const payload: BoostNetworkSnapshot = { boosterCount };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream unreachable';
    const missingKey =
      message.includes('ONSOCIAL_API_KEY') ||
      message.includes('cannot create a server-side OnSocial client');
    return NextResponse.json(
      { error: missingKey ? 'OnAPI key is not configured' : message },
      { status: missingKey ? 503 : 502 }
    );
  }
}
