import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import { loadPortalProfileShells } from '@/lib/portal-profile-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASONS_BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

interface SeasonStandingRecord {
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  [key: string]: unknown;
}

interface SeasonStandingsPayload {
  success?: boolean;
  standings?: SeasonStandingRecord[];
  [key: string]: unknown;
}

function buildTargetUrl(pathSegments: string[], search: string): string {
  const trimmedBase = SEASONS_BACKEND_URL.replace(/\/$/, '');
  const encodedPath = pathSegments.map(encodeURIComponent).join('/');
  return `${trimmedBase}/v1/seasons/${encodedPath}${search}`;
}

function isStandingsPath(pathSegments: string[]): boolean {
  return pathSegments.at(-1) === 'standings';
}

async function enrichStandingsPayload(
  data: SeasonStandingsPayload
): Promise<SeasonStandingsPayload> {
  const standings = data.standings ?? [];
  if (standings.length === 0) return data;

  const shells = await loadPortalProfileShells(
    standings.map((standing) => standing.accountId)
  );

  return {
    ...data,
    standings: standings.map((standing) => {
      const shell = shells.get(standing.accountId.trim().toLowerCase());
      return {
        ...standing,
        displayName:
          standing.displayName?.trim() || shell?.profile?.name?.trim() || null,
        avatarUrl: shell?.avatarUrl ?? standing.avatarUrl ?? null,
      };
    }),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const targetUrl = buildTargetUrl(path, request.nextUrl.search);

  try {
    const res = await fetch(targetUrl, { cache: 'no-store' });
    const body = await res.text();
    const headers = new Headers();

    for (const headerName of FORWARDED_RESPONSE_HEADERS) {
      const value = res.headers.get(headerName);
      if (value) {
        headers.set(headerName, value);
      }
    }

    if (res.ok && isStandingsPath(path)) {
      const data = JSON.parse(body) as SeasonStandingsPayload;
      if (Array.isArray(data.standings)) {
        const enriched = await enrichStandingsPayload(data);
        return NextResponse.json(enriched, { status: res.status, headers });
      }
    }

    return new NextResponse(body, {
      status: res.status,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upstream error';

    return NextResponse.json(
      {
        success: false,
        error: 'Backend unreachable',
        upstream: targetUrl,
        detail: message,
      },
      { status: 502 }
    );
  }
}
