import { NextRequest, NextResponse } from 'next/server';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import type { EndorsementListItem } from '@onsocial/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EnrichedEndorsementListItem extends EndorsementListItem {
  issuerName: string | null;
  issuerAvatarUrl: string | null;
  targetName: string | null;
  targetAvatarUrl: string | null;
}

interface ProfileEndorsementsResponse {
  accountId: string;
  received: EnrichedEndorsementListItem[];
  given: EnrichedEndorsementListItem[];
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const REVALIDATE_SECONDS = 30;

function getAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Endorsements query failed';
}

export async function GET(request: NextRequest) {
  const accountId = getAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const os = createPortalServerOnSocialClient();
    const [received, given] = await Promise.all([
      os.endorsements.listReceived(accountId, { limit: 100 }),
      os.endorsements.listGiven(accountId, { limit: 100 }),
    ]);
    const participantIds = Array.from(
      new Set(
        [...received, ...given].flatMap((endorsement) => [
          endorsement.issuer,
          endorsement.target,
        ])
      )
    );
    const profiles = await os.profiles.getMany(participantIds);
    const enrich = (
      endorsement: EndorsementListItem
    ): EnrichedEndorsementListItem => {
      const issuerProfile = profiles[endorsement.issuer] ?? null;
      const targetProfile = profiles[endorsement.target] ?? null;
      return {
        ...endorsement,
        issuerName: issuerProfile?.name ?? null,
        issuerAvatarUrl: os.profiles.avatarUrl(issuerProfile),
        targetName: targetProfile?.name ?? null,
        targetAvatarUrl: os.profiles.avatarUrl(targetProfile),
      };
    };

    const response: ProfileEndorsementsResponse = {
      accountId,
      received: received.map(enrich),
      given: given.map(enrich),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 3}`,
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY') || detail.includes('GATEWAY_SERVICE_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Endorsements query failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
