import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import { loadPortalProfileShells } from '@/lib/portal-profile-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASONS_BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;

interface SeasonZeroStandingRecord {
  accountId: string;
  [key: string]: unknown;
}

interface SeasonZeroStandingsPayload {
  success?: boolean;
  standings?: SeasonZeroStandingRecord[];
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  const targetUrl = `${SEASONS_BACKEND_URL.replace(/\/$/, '')}/v1/seasons/season-zero/standings${search}`;

  try {
    const res = await fetch(targetUrl, { cache: 'no-store' });
    const data = (await res.json()) as SeasonZeroStandingsPayload;

    if (!res.ok || data.success === false) {
      return NextResponse.json(data, { status: res.status });
    }

    const standings = data.standings ?? [];
    const shells = await loadPortalProfileShells(
      standings.map((standing) => standing.accountId)
    );

    const enrichedStandings = standings.map((standing) => {
      const shell = shells.get(standing.accountId.trim().toLowerCase());
      return {
        ...standing,
        displayName: shell?.profile?.name?.trim() || null,
        avatarUrl: shell?.avatarUrl ?? null,
      };
    });

    return NextResponse.json({
      ...data,
      standings: enrichedStandings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upstream error';

    return NextResponse.json(
      {
        success: false,
        error: 'Could not load Season 0 standings',
        upstream: targetUrl,
        detail: message,
      },
      { status: 502 }
    );
  }
}
