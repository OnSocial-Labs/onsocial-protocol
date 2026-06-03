import type { EndorsementListItem, EndorsementRecord } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  isProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';

export type EndorsementListMode = 'received' | 'given';

export interface EnrichedEndorsementListItem extends EndorsementListItem {
  issuerName: string | null;
  issuerAvatarUrl: string | null;
  targetName: string | null;
  targetAvatarUrl: string | null;
}

export interface EndorsementCounts {
  received: number;
  given: number;
}

export const ENDORSEMENT_PAGE_SIZE = 24;
export const ENDORSEMENT_PREVIEW_LIMIT = 24;
export const ENDORSEMENT_MAX_OFFSET = 10_000;

type PortalOnSocialClient = ReturnType<typeof createPortalServerOnSocialClient>;

function parseEndorsementRow(row: {
  issuer: string;
  target: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
}): EndorsementListItem {
  let parsed: Record<string, unknown> = {};
  try {
    parsed =
      typeof row.value === 'string' && row.value.length > 0
        ? (JSON.parse(row.value) as Record<string, unknown>)
        : {};
  } catch {
    parsed = {};
  }

  return {
    issuer: row.issuer,
    target: row.target,
    v: typeof parsed.v === 'number' ? parsed.v : 1,
    since: typeof parsed.since === 'number' ? parsed.since : 0,
    ...(parsed as Omit<EndorsementRecord, 'target' | 'v' | 'since'>),
    blockHeight: Number(row.blockHeight) || 0,
    blockTimestamp: Number(row.blockTimestamp) || 0,
  };
}

export async function getEndorsementCounts(
  os: PortalOnSocialClient,
  accountId: string
): Promise<EndorsementCounts> {
  return os.endorsements.counts(accountId);
}

export async function enrichEndorsements(
  os: PortalOnSocialClient,
  endorsements: EndorsementListItem[]
): Promise<EnrichedEndorsementListItem[]> {
  const participantIds = Array.from(
    new Set(
      endorsements.flatMap((endorsement) => [
        endorsement.issuer,
        endorsement.target,
      ])
    )
  );
  const profiles = await os.profiles.getMany(participantIds);

  return endorsements.map((endorsement) => {
    const issuerProfile = profiles[endorsement.issuer] ?? null;
    const targetProfile = profiles[endorsement.target] ?? null;
    return {
      ...endorsement,
      issuerName: issuerProfile?.name ?? null,
      issuerAvatarUrl: os.profiles.avatarUrl(issuerProfile),
      targetName: targetProfile?.name ?? null,
      targetAvatarUrl: os.profiles.avatarUrl(targetProfile),
    };
  });
}

export async function listViewerEndorsementsToTarget(
  os: PortalOnSocialClient,
  viewerAccountId: string,
  targetAccountId: string
): Promise<EnrichedEndorsementListItem[]> {
  const rows = await os.endorsements.listFromViewerToTarget(
    viewerAccountId,
    targetAccountId,
    { limit: 20 }
  );
  return enrichEndorsements(os, rows);
}

export async function listEndorsementsPage(
  os: PortalOnSocialClient,
  accountId: string,
  mode: EndorsementListMode,
  limit: number,
  offset: number,
  searchQuery?: string | null
): Promise<{
  endorsements: EnrichedEndorsementListItem[];
  hasMore: boolean;
  total: number;
}> {
  if (isProfileSearchQuery(searchQuery)) {
    const participantIds = await searchMatchingAccountIds(os, searchQuery);
    const filtered =
      mode === 'received'
        ? await os.query.endorsements.receivedFilteredPage(
            accountId,
            participantIds,
            { limit, offset }
          )
        : await os.query.endorsements.givenFilteredPage(
            accountId,
            participantIds,
            { limit, offset }
          );
    const endorsements = await enrichEndorsements(
      os,
      filtered.rows.map(parseEndorsementRow)
    );

    return {
      endorsements,
      hasMore: offset + endorsements.length < filtered.total,
      total: filtered.total,
    };
  }

  const counts = await getEndorsementCounts(os, accountId);
  const total = mode === 'received' ? counts.received : counts.given;
  const rows =
    mode === 'received'
      ? await os.endorsements.listReceived(accountId, { limit, offset })
      : await os.endorsements.listGiven(accountId, { limit, offset });
  const endorsements = await enrichEndorsements(os, rows);

  return {
    endorsements,
    hasMore: offset + endorsements.length < total,
    total,
  };
}

export async function loadEndorsementPreview(
  os: PortalOnSocialClient,
  accountId: string,
  viewerAccountId: string | null
): Promise<{
  counts: EndorsementCounts;
  received: EnrichedEndorsementListItem[];
  given: EnrichedEndorsementListItem[];
  viewerToTarget: EnrichedEndorsementListItem[];
}> {
  const [counts, receivedRows, givenRows, viewerToTarget] = await Promise.all([
    getEndorsementCounts(os, accountId),
    os.endorsements.listReceived(accountId, {
      limit: ENDORSEMENT_PREVIEW_LIMIT,
    }),
    os.endorsements.listGiven(accountId, {
      limit: ENDORSEMENT_PREVIEW_LIMIT,
    }),
    viewerAccountId && viewerAccountId !== accountId
      ? listViewerEndorsementsToTarget(os, viewerAccountId, accountId)
      : Promise.resolve([]),
  ]);

  const [received, given] = await Promise.all([
    enrichEndorsements(os, receivedRows),
    enrichEndorsements(os, givenRows),
  ]);

  return {
    counts,
    received,
    given,
    viewerToTarget,
  };
}
