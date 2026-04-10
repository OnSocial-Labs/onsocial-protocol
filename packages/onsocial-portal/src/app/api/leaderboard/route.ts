import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/portal-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HASURA_URL =
  process.env.HASURA_URL ??
  process.env.NEXT_PUBLIC_HASURA_URL ??
  `${ACTIVE_API_URL.replace(/\/$/, '')}/v1/graphql`;

const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET ?? '';

const MAX_LIMIT = 50;
const REVALIDATE_SECONDS = 30;

type LeaderboardScope =
  | 'influence'
  | 'commitment'
  | 'composite'
  | 'earners'
  | 'compact';

const EVENT_FETCH_LIMIT = 5000;
const STATE_FETCH_LIMIT = 5000;

function buildQuery(scope: LeaderboardScope, limit: number): string {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  switch (scope) {
    case 'influence':
      return `{
        boosterState(
          where: { lockedAmount: { _neq: "0" } }
          orderBy: { effectiveBoost: DESC }
          limit: ${safeLimit}
        ) {
          accountId
          lockedAmount
          effectiveBoost
          lockMonths
          totalClaimed
          totalCreditsPurchased
          lastEventType
          lastEventBlock
        }
      }`;

    case 'commitment':
      return `{
        boosterState(
          where: { lockedAmount: { _neq: "0" } }
          orderBy: [{ lockMonths: DESC }, { effectiveBoost: DESC }]
          limit: ${safeLimit}
        ) {
          accountId
          lockedAmount
          effectiveBoost
          lockMonths
          lastEventType
        }
      }`;

    case 'composite':
      return `{
        boosterState(
          where: { lockedAmount: { _neq: "0" } }
          orderBy: { effectiveBoost: DESC }
          limit: ${STATE_FETCH_LIMIT}
        ) {
          accountId
          lockedAmount
          effectiveBoost
          lockMonths
        }
        rewardsEvents(
          where: { eventType: { _eq: "REWARD_CREDITED" }, amount: { _isNull: false } }
          orderBy: { blockHeight: DESC }
          limit: ${EVENT_FETCH_LIMIT}
        ) {
          accountId
          amount
        }
      }`;

    case 'earners':
      // Fetch all REWARD_CREDITED events — we aggregate server-side because
      // user_reward_state only stores the last event amount, not cumulative.
      return `{
        rewardsEvents(
          where: { eventType: { _eq: "REWARD_CREDITED" }, amount: { _isNull: false } }
          orderBy: { blockHeight: DESC }
          limit: ${EVENT_FETCH_LIMIT}
        ) {
          accountId
          amount
          blockHeight
        }
      }`;

    case 'compact':
      return `{
        influence: boosterState(
          where: { lockedAmount: { _neq: "0" } }
          orderBy: { effectiveBoost: DESC }
          limit: 5
        ) {
          accountId
          effectiveBoost
          lockMonths
        }
        earners: rewardsEvents(
          where: { eventType: { _eq: "REWARD_CREDITED" }, amount: { _isNull: false } }
          orderBy: { blockHeight: DESC }
          limit: ${EVENT_FETCH_LIMIT}
        ) {
          accountId
          amount
        }
      }`;

    default:
      return `{ boosterState(limit: 1) { accountId } }`;
  }
}

// ---------------------------------------------------------------------------
// Earner aggregation — SUM(amount) grouped by accountId, sorted DESC
// ---------------------------------------------------------------------------

interface CreditEvent {
  accountId: string;
  amount: string;
  blockHeight?: number;
}

interface AggregatedEarner {
  accountId: string;
  totalEarned: string;
}

interface CompositeBoostRow {
  accountId: string;
  lockedAmount: string;
  effectiveBoost: string;
  lockMonths: number;
}

interface CompositeEntry {
  accountId: string;
  effectiveBoost: string;
  totalEarned: string;
  lockMonths: number;
  score: number;
}

function approximateLog10(raw: string): number {
  const normalized = raw.replace(/^0+/, '');

  if (!normalized) {
    return 0;
  }

  const head = normalized.slice(0, Math.min(15, normalized.length));
  const mantissa = Number.parseFloat(`0.${head}`);
  return normalized.length + Math.log10(mantissa || 1) - 1;
}

function aggregateEarnersMap(events: CreditEvent[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();

  for (const event of events) {
    const previous = totals.get(event.accountId) ?? 0n;
    totals.set(event.accountId, previous + BigInt(event.amount));
  }

  return totals;
}

function aggregateEarners(
  events: CreditEvent[],
  limit: number
): AggregatedEarner[] {
  return Array.from(aggregateEarnersMap(events).entries())
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .slice(0, limit)
    .map(([accountId, total]) => ({
      accountId,
      totalEarned: total.toString(),
    }));
}

function aggregateComposite(
  boostRows: CompositeBoostRow[],
  rewardEvents: CreditEvent[],
  limit: number
): CompositeEntry[] {
  const rewardTotals = aggregateEarnersMap(rewardEvents);
  const boostByAccount = new Map<string, CompositeBoostRow>();

  for (const row of boostRows) {
    boostByAccount.set(row.accountId, row);
  }

  const accountIds = new Set<string>([
    ...boostByAccount.keys(),
    ...rewardTotals.keys(),
  ]);

  const candidates = Array.from(accountIds).map((accountId) => {
    const boost = boostByAccount.get(accountId);
    return {
      accountId,
      effectiveBoost: boost?.effectiveBoost ?? '0',
      totalEarned: (rewardTotals.get(accountId) ?? 0n).toString(),
      lockMonths: boost?.lockMonths ?? 0,
    };
  });

  const maxBoostLog = Math.max(
    1,
    ...candidates.map((candidate) => approximateLog10(candidate.effectiveBoost))
  );
  const maxEarnLog = Math.max(
    1,
    ...candidates.map((candidate) => approximateLog10(candidate.totalEarned))
  );

  return candidates
    .map((candidate) => {
      const boostScore =
        approximateLog10(candidate.effectiveBoost) / maxBoostLog;
      const earnScore = approximateLog10(candidate.totalEarned) / maxEarnLog;
      const score = Number.parseFloat(
        ((boostScore * 0.7 + earnScore * 0.3) * 100).toFixed(2)
      );

      return {
        ...candidate,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  const scope = (request.nextUrl.searchParams.get('scope') ??
    'influence') as LeaderboardScope;
  const limit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? '20',
    10
  );

  const validScopes: LeaderboardScope[] = [
    'influence',
    'commitment',
    'composite',
    'earners',
    'compact',
  ];
  if (!validScopes.includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  }

  const query = buildQuery(scope, limit);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (HASURA_ADMIN_SECRET) {
    headers['x-hasura-admin-secret'] = HASURA_ADMIN_SECRET;
  }

  try {
    const res = await fetch(HASURA_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const body = await res.json();

    if (body.errors) {
      return NextResponse.json(
        { error: 'Query failed', details: body.errors },
        { status: 502 }
      );
    }

    // Earners: aggregate REWARD_CREDITED events by account server-side.
    // The user_reward_state table has a known bug (stores last amount, not
    // cumulative), so we SUM from the event log instead.
    const data = body.data;
    if (scope === 'earners' && data.rewardsEvents) {
      const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
      data.earners = aggregateEarners(data.rewardsEvents, safeLimit);
      delete data.rewardsEvents;
    }
    if (scope === 'composite' && data.boosterState && data.rewardsEvents) {
      const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
      data.composite = aggregateComposite(
        data.boosterState,
        data.rewardsEvents,
        safeLimit
      );
      delete data.boosterState;
      delete data.rewardsEvents;
    }
    if (scope === 'compact' && data.earners) {
      // compact scope aliases earners → rewardsEvents in the query
      data.earners = aggregateEarners(data.earners, 5);
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Upstream unreachable' },
      { status: 502 }
    );
  }
}
