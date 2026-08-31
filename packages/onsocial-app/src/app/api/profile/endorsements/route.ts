import { NextRequest, NextResponse } from 'next/server';
import {
  loadEndorsementFocus,
  loadEndorsementsModePage,
  loadEndorsementsPageData,
  parseEndorsementsMode,
} from '@/lib/load-endorsements-page';
import { ENDORSEMENTS_PAGE_SIZE } from '@/lib/endorsements-panel-data';
import { parsePortfolioEndorsementFocus } from '@/lib/overlay-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function readInt(
  value: string | null,
  fallback: number,
  max: number
): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  const accountId = readAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      {
        error: 'Invalid accountId',
        detail: 'Provide a valid NEAR account id.',
      },
      { status: 400 }
    );
  }

  const focus = parsePortfolioEndorsementFocus(request.nextUrl.searchParams);
  if (focus) {
    const item = await loadEndorsementFocus(accountId, focus);
    return NextResponse.json({ accountId, item });
  }

  const mode = parseEndorsementsMode(
    request.nextUrl.searchParams.get('mode')
  );
  const limit = readInt(
    request.nextUrl.searchParams.get('limit'),
    ENDORSEMENTS_PAGE_SIZE,
    48
  );
  const offset = readInt(request.nextUrl.searchParams.get('offset'), 0, 10_000);

  if (mode) {
    const data = await loadEndorsementsModePage(accountId, mode, {
      limit,
      offset,
    });
    if (!data) {
      return NextResponse.json(
        {
          error: 'Endorsements unavailable',
          detail: 'Endorsements query failed',
        },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  }

  const data = await loadEndorsementsPageData(accountId);
  if (!data) {
    return NextResponse.json(
      {
        error: 'Endorsements unavailable',
        detail: 'Endorsements query failed',
      },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
