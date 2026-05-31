import { NextRequest, NextResponse } from 'next/server';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { viewAccount } from '@/lib/near-rpc';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
} from '@/lib/portal-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PortalProfileResponse {
  accountId: string;
  profile: MaterialisedProfile | null;
  indexedProfile: Record<string, string> | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  firstProfileTimestamp: number | null;
  latestProfileUpdateFields: string[];
  network: typeof ACTIVE_NEAR_NETWORK;
  nearAccount: {
    codeHash: string;
    storageUsage: number;
  } | null;
  nearAccountExplorerUrl: string;
  nearAccountCreation: {
    blockTimestamp: number;
    transactionHash: string | null;
    explorerUrl: string | null;
  } | null;
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function getAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile query failed';
}

const PROFILE_FIELDS_TO_DISPLAY = new Set([
  'name',
  'bio',
  'avatar',
  'banner',
  'links',
]);

const JOINED_PROFILE_FIELDS = new Set([
  'name',
  'bio',
  'avatar',
  'banner',
  'links',
]);

function profileFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: 'Name',
    bio: 'Bio',
    avatar: 'Avatar',
    banner: 'Banner',
    links: 'Links',
  };

  return (
    labels[field] ??
    field
      .replace(/[_-]+/gu, ' ')
      .replace(/\b\w/gu, (letter) => letter.toUpperCase())
  );
}

function latestProfileUpdateFields(rows: ProfileFieldRow[]): string[] {
  const displayRows = rows.filter((row) =>
    PROFILE_FIELDS_TO_DISPLAY.has(row.field)
  );
  if (displayRows.length === 0) return [];

  const latestBlockHeight = Math.max(
    ...displayRows.map((row) => Number(row.blockHeight) || 0)
  );
  const latestTimestamp = Math.max(
    ...displayRows
      .filter((row) => Number(row.blockHeight) === latestBlockHeight)
      .map((row) => Number(row.blockTimestamp) || 0)
  );

  return Array.from(
    new Set(
      displayRows
        .filter(
          (row) =>
            Number(row.blockHeight) === latestBlockHeight &&
            Number(row.blockTimestamp) === latestTimestamp
        )
        .map((row) => profileFieldLabel(row.field))
    )
  );
}

interface NearBlocksAccountResponse {
  account?: Array<{
    created?: {
      block_timestamp?: string | number | null;
      transaction_hash?: string | null;
    } | null;
  }>;
}

interface ProfileFieldRow {
  field: string;
  value: string | null;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

function earliestProfileFieldTimestamp(rows: ProfileFieldRow[]): number | null {
  let earliest: number | null = null;

  for (const row of rows) {
    if (row.operation !== 'set') continue;
    if (!row.value?.trim()) continue;
    if (!JOINED_PROFILE_FIELDS.has(row.field)) continue;

    const timestamp = Number(row.blockTimestamp) || 0;
    if (timestamp <= 0) continue;
    if (earliest === null || timestamp < earliest) earliest = timestamp;
  }

  return earliest;
}

function resolveFirstProfileTimestamp(
  indexedTimestamp: number | null | undefined,
  profileFieldRows: ProfileFieldRow[],
  nearAccountCreation: PortalProfileResponse['nearAccountCreation']
): number | null {
  if (indexedTimestamp) return indexedTimestamp;

  const fromProfileFields = earliestProfileFieldTimestamp(profileFieldRows);
  if (fromProfileFields) return fromProfileFields;

  return nearAccountCreation?.blockTimestamp ?? null;
}

function nearBlocksApiBase(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.nearblocks.io'
    : 'https://api-testnet.nearblocks.io';
}

function normalizeNearBlocksTimestamp(
  value?: string | number | null
): number | null {
  if (value == null) return null;

  try {
    const raw = BigInt(String(value));
    if (raw <= 0n) return null;
    if (raw > 1_000_000_000_000_000n) {
      return Number(raw / 1_000_000n);
    }
    if (raw < 1_000_000_000_000n) {
      return Number(raw * 1000n);
    }
    return Number(raw);
  } catch {
    return null;
  }
}

async function fetchNearBlocksAccountCreation(accountId: string): Promise<{
  blockTimestamp: number;
  transactionHash: string | null;
  explorerUrl: string | null;
} | null> {
  const response = await fetch(
    `${nearBlocksApiBase()}/v1/account/${encodeURIComponent(accountId)}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    }
  );

  if (!response.ok) return null;

  const body = (await response
    .json()
    .catch(() => null)) as NearBlocksAccountResponse | null;
  const created = body?.account?.[0]?.created;
  const blockTimestamp = normalizeNearBlocksTimestamp(created?.block_timestamp);

  if (!blockTimestamp) return null;

  const transactionHash = created?.transaction_hash?.trim() || null;

  return {
    blockTimestamp,
    transactionHash,
    explorerUrl: transactionHash
      ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${transactionHash}`
      : null,
  };
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
    const [
      profile,
      indexedProfile,
      profileSearchRow,
      profileFieldRowsResponse,
      nearAccount,
      nearAccountCreation,
    ] = await Promise.all([
      os.profiles.get(accountId),
      os.query.profiles.get(accountId),
      os.query
        .graphql<{
          profileSearch: Array<{ firstProfileTimestamp: number | null }>;
        }>({
          query: `query ProfileLookup($id: String!) {
            profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
              firstProfileTimestamp
            }
          }`,
          variables: { id: accountId },
        })
        .then((res) => res.data?.profileSearch?.[0] ?? null)
        .catch(() => null),
      os.query
        .graphql<{ profilesCurrent: ProfileFieldRow[] }>({
          query: `query ProfileFields($id: String!) {
            profilesCurrent(where: {accountId: {_eq: $id}}) {
              field value blockHeight blockTimestamp operation
            }
          }`,
          variables: { id: accountId },
        })
        .catch(() => ({ data: { profilesCurrent: [] } })),
      viewAccount(accountId).catch(() => null),
      fetchNearBlocksAccountCreation(accountId).catch(() => null),
    ]);
    const profileFieldRows = profileFieldRowsResponse.data?.profilesCurrent ?? [];

    const response: PortalProfileResponse = {
      accountId,
      profile,
      indexedProfile,
      avatarUrl: os.profiles.avatarUrl(profile),
      bannerUrl: os.profiles.bannerUrl(profile),
      firstProfileTimestamp: resolveFirstProfileTimestamp(
        profileSearchRow?.firstProfileTimestamp,
        profileFieldRows,
        nearAccountCreation
      ),
      latestProfileUpdateFields: latestProfileUpdateFields(profileFieldRows),
      network: ACTIVE_NEAR_NETWORK,
      nearAccount: nearAccount
        ? {
            codeHash: nearAccount.code_hash,
            storageUsage: nearAccount.storage_usage,
          }
        : null,
      nearAccountExplorerUrl: `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`,
      nearAccountCreation,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Profile query failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
