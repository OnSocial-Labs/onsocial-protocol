import {
  materialiseProfileFromRows,
  type MaterialisedProfile,
} from '@onsocial/sdk';
import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export interface ProfileFieldRow {
  field: string;
  value: string | null;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

export interface PortalProfileCorePayload {
  accountId: string;
  profile: MaterialisedProfile | null;
  indexedProfile: Record<string, string> | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  firstProfileTimestamp: number | null;
  latestProfileUpdateFields: string[];
  network: typeof ACTIVE_NEAR_NETWORK;
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

function indexedProfileFromRows(
  rows: ProfileFieldRow[]
): Record<string, string> | null {
  if (rows.length === 0) return null;

  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.operation === 'delete') continue;
    if (row.value != null) out[row.field] = row.value;
  }

  return Object.keys(out).length ? out : null;
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
  profileFieldRows: ProfileFieldRow[]
): number | null {
  if (indexedTimestamp) return indexedTimestamp;
  return earliestProfileFieldTimestamp(profileFieldRows);
}

export async function loadPortalProfileCore(
  os: PortalOnSocial,
  accountId: string
): Promise<PortalProfileCorePayload> {
  const profileBundle = await os.query.graphql<{
    profilesCurrent: ProfileFieldRow[];
    profileSearch: Array<{ firstProfileTimestamp: number | null }>;
  }>({
    query: `query PortalProfileCore($id: String!) {
      profilesCurrent(where: {accountId: {_eq: $id}}) {
        field value blockHeight blockTimestamp operation
      }
      profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
        firstProfileTimestamp
      }
    }`,
    variables: { id: accountId },
  });

  const profileFieldRows = profileBundle.data?.profilesCurrent ?? [];
  const profile = materialiseProfileFromRows(
    accountId,
    profileFieldRows.map((row) => ({
      accountId,
      field: row.field,
      value: row.value ?? '',
      blockHeight: row.blockHeight,
      blockTimestamp: row.blockTimestamp,
      operation: row.operation,
    }))
  );
  const indexedProfile = indexedProfileFromRows(profileFieldRows);

  return {
    accountId,
    profile,
    indexedProfile,
    avatarUrl: os.profiles.avatarUrl(profile),
    bannerUrl: os.profiles.bannerUrl(profile),
    firstProfileTimestamp: resolveFirstProfileTimestamp(
      profileBundle.data?.profileSearch?.[0]?.firstProfileTimestamp,
      profileFieldRows
    ),
    latestProfileUpdateFields: latestProfileUpdateFields(profileFieldRows),
    network: ACTIVE_NEAR_NETWORK,
  };
}
