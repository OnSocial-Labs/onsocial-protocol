import { NextRequest, NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import type {
  ProfileSupportReceivedHistoryPage,
  ProfileSupportReceivedSummary,
} from '@/lib/profile-support-received';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const CURRENT_LIMIT = 50;
const HISTORY_PAGE = 20;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return NextResponse.json(
      { error: 'Valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  const section = request.nextUrl.searchParams.get('section')?.trim() || 'summary';
  const beforeBlockHeight = parsePositiveInt(
    request.nextUrl.searchParams.get('beforeBlockHeight')
  );

  try {
    const os = createServerOnSocialClient();
    const lastCollect =
      await os.query.socialSpend.lastTargetCollect(accountId);
    const lastHeight = lastCollect?.blockHeight ?? null;

    if (section === 'history') {
      if (lastHeight == null && beforeBlockHeight == null) {
        const empty: ProfileSupportReceivedHistoryPage = {
          accountId,
          items: [],
          hasMore: false,
        };
        return NextResponse.json(empty);
      }

      const before = beforeBlockHeight ?? lastHeight!;
      const rows = await os.query.socialSpend.supportReceived(accountId, {
        beforeBlockHeight: before,
        limit: HISTORY_PAGE + 1,
      });
      const body: ProfileSupportReceivedHistoryPage = {
        accountId,
        items: rows.slice(0, HISTORY_PAGE),
        hasMore: rows.length > HISTORY_PAGE,
      };
      return NextResponse.json(body);
    }

    const current = await os.query.socialSpend.supportReceived(accountId, {
      ...(lastHeight != null
        ? { minBlockHeight: lastHeight + 1 }
        : {}),
      limit: CURRENT_LIMIT,
    });

    let history: ProfileSupportReceivedSummary['history'] = [];
    let historyHasMore = false;
    if (lastHeight != null) {
      const older = await os.query.socialSpend.supportReceived(accountId, {
        beforeBlockHeight: lastHeight,
        limit: HISTORY_PAGE + 1,
      });
      history = older.slice(0, HISTORY_PAGE);
      historyHasMore = older.length > HISTORY_PAGE;
    }

    const body: ProfileSupportReceivedSummary = {
      accountId,
      lastCollectBlockHeight: lastHeight,
      current,
      history,
      historyHasMore,
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: 'Could not load support history' },
      { status: 502 }
    );
  }
}
