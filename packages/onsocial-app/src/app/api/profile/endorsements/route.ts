import { NextRequest, NextResponse } from 'next/server';
import type { EndorsementListItem, ProfileSearchRow } from '@onsocial/sdk';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import { createAppOnSocialClient } from '@/lib/profile-social-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const PREVIEW_LIMIT = 24;

function readAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function profileMap(rows: ProfileSearchRow[]): Map<string, ProfileSearchRow> {
  return new Map(rows.map((row) => [row.accountId, row]));
}

function enrich(
  item: EndorsementListItem,
  profiles: Map<string, ProfileSearchRow>
): EndorsementPanelItem {
  const issuer = profiles.get(item.issuer);
  const target = profiles.get(item.target);
  return {
    ...item,
    issuerName: issuer?.name ?? null,
    issuerAvatarUrl: issuer?.avatar ?? null,
    targetName: target?.name ?? null,
    targetAvatarUrl: target?.avatar ?? null,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Endorsements query failed';
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

  try {
    const os = createAppOnSocialClient();
    const [bundle, receivedItems, givenItems] = await Promise.all([
      os.endorsements.previewBundle(accountId, { limit: PREVIEW_LIMIT }),
      os.endorsements.listReceived(accountId, { limit: PREVIEW_LIMIT }),
      os.endorsements.listGiven(accountId, { limit: PREVIEW_LIMIT }),
    ]);
    const profiles = profileMap(bundle.profiles);

    return NextResponse.json({
      accountId,
      counts: bundle.counts,
      received: receivedItems.map((item) => enrich(item, profiles)),
      given: givenItems.map((item) => enrich(item, profiles)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Endorsements unavailable',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
