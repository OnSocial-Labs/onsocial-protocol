import { NextResponse } from 'next/server';
import { gatewayQuery } from '@/lib/gateway-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVALIDATE_SECONDS = 30;

type BoostNetworkSnapshot = {
  boosterCount: number;
};

export async function GET() {
  try {
    const data = await gatewayQuery<{
      leaderboardBoostAggregate?: {
        aggregate?: { count?: number | null } | null;
      } | null;
      boosterStateAggregate?: {
        aggregate?: { count?: number | null } | null;
      } | null;
    }>(`{
      leaderboardBoostAggregate {
        aggregate { count }
      }
      boosterStateAggregate(
        where: {
          _and: [
            { effectiveBoost: { _neq: "0" } },
            { effectiveBoost: { _neq: "" } }
          ]
        }
      ) {
        aggregate { count }
      }
    }`);

    const fromLeaderboard =
      data.leaderboardBoostAggregate?.aggregate?.count ?? null;
    const fromState = data.boosterStateAggregate?.aggregate?.count ?? null;
    const boosterCount =
      typeof fromLeaderboard === 'number' && fromLeaderboard > 0
        ? fromLeaderboard
        : typeof fromState === 'number'
          ? fromState
          : 0;

    const payload: BoostNetworkSnapshot = { boosterCount };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
