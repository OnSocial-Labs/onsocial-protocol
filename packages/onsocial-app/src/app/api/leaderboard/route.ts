import { NextRequest, NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  LEADERBOARD_PAGE_SIZE,
  REPUTATION_BOARD_GRAPHQL_FIELDS,
  findViewerEntry,
  type LeaderboardTrack,
} from '@/lib/leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 50;
const MAX_OFFSET = 200;
const REVALIDATE_SECONDS = 30;

const VALID_SCOPES: LeaderboardTrack[] = ['influence', 'reputation', 'earners'];

function escapeGraphQlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildQuery(
  scope: LeaderboardTrack,
  limit: number,
  offset: number,
  viewerAccountId: string | null
): string {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const safeOffset = Math.min(Math.max(0, offset), MAX_OFFSET);
  const viewer =
    viewerAccountId && viewerAccountId.length > 0
      ? escapeGraphQlString(viewerAccountId)
      : null;

  switch (scope) {
    case 'influence':
      return `{
        leaderboardBoost(orderBy: { rank: ASC }, limit: ${safeLimit}, offset: ${safeOffset}) {
          accountId
          lockedAmount
          effectiveBoost
          lockMonths
          rank
        }
        ${
          viewer && safeOffset === 0
            ? `viewerEntry: leaderboardBoost(where: {accountId: {_eq: "${viewer}"}}, limit: 1) {
          accountId
          lockedAmount
          effectiveBoost
          lockMonths
          rank
        }`
            : ''
        }
      }`;
    case 'reputation':
      return `{
        reputationScores(orderBy: { rank: ASC }, limit: ${safeLimit}, offset: ${safeOffset}) {
          ${REPUTATION_BOARD_GRAPHQL_FIELDS}
        }
        ${
          viewer && safeOffset === 0
            ? `viewerEntry: reputationScores(where: {accountId: {_eq: "${viewer}"}}, limit: 1) {
          ${REPUTATION_BOARD_GRAPHQL_FIELDS}
        }`
            : ''
        }
      }`;
    case 'earners':
      return `{
        leaderboardRewards(orderBy: { rank: ASC }, limit: ${safeLimit}, offset: ${safeOffset}) {
          accountId
          totalEarned
          unclaimed
          rank
        }
        ${
          viewer && safeOffset === 0
            ? `viewerEntry: leaderboardRewards(where: {accountId: {_eq: "${viewer}"}}, limit: 1) {
          accountId
          totalEarned
          unclaimed
          rank
        }`
            : ''
        }
      }`;
  }
}

export async function GET(request: NextRequest) {
  const scope = (request.nextUrl.searchParams.get('scope') ??
    'reputation') as LeaderboardTrack;
  const limit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? String(LEADERBOARD_PAGE_SIZE),
    10
  );
  const offset = Number.parseInt(
    request.nextUrl.searchParams.get('offset') ?? '0',
    10
  );
  const viewer = request.nextUrl.searchParams.get('viewer')?.trim() || null;

  if (!VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  }

  try {
    const os = createServerOnSocialClient();
    const res = await os.query.graphql<Record<string, unknown>>({
      query: buildQuery(scope, limit, offset, viewer),
    });
    const data = { ...(res.data ?? {}) } as Record<string, unknown>;
    const viewerRows = data.viewerEntry;
    if (Array.isArray(viewerRows)) {
      data.viewerEntry = viewerRows[0] ?? null;
    }

    // Prefer the in-list row when the viewer is already on the page.
    if (viewer && offset === 0) {
      const listKey =
        scope === 'influence'
          ? 'leaderboardBoost'
          : scope === 'reputation'
            ? 'reputationScores'
            : 'leaderboardRewards';
      const list = data[listKey];
      if (Array.isArray(list)) {
        const hit = findViewerEntry(
          list as Array<{ accountId: string }>,
          viewer
        );
        if (hit) {
          data.viewerEntry = hit.entry;
        }
      }
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': viewer
          ? 'private, no-store'
          : `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
