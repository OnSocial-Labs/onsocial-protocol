import type {
  EndorsementListItem,
  EndorsementRecord,
  ProfileSearchRow,
} from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  isProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';
import { parseEndorsementMediaRef } from '@/lib/endorsement-media';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';

export type EndorsementListMode = 'received' | 'given';

export interface EnrichedEndorsementListItem extends EndorsementListItem {
  issuerName: string | null;
  issuerAvatarUrl: string | null;
  targetName: string | null;
  targetAvatarUrl: string | null;
  mediaUrl: string | null;
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

function enrichEndorsementsFromProfiles(
  os: PortalOnSocialClient,
  endorsements: EndorsementListItem[],
  profiles: ProfileSearchRow[]
): EnrichedEndorsementListItem[] {
  const profileById = new Map(profiles.map((row) => [row.accountId, row]));

  return endorsements.map((endorsement) => {
    const issuerRow = profileById.get(endorsement.issuer) ?? null;
    const targetRow = profileById.get(endorsement.target) ?? null;
    const issuerProfile = issuerRow
      ? profileSearchRowToMaterialised(issuerRow)
      : null;
    const targetProfile = targetRow
      ? profileSearchRowToMaterialised(targetRow)
      : null;

    const media = parseEndorsementMediaRef(endorsement.media);

    return {
      ...endorsement,
      issuerName: issuerRow?.name ?? null,
      issuerAvatarUrl: os.profiles.avatarUrl(issuerProfile),
      targetName: targetRow?.name ?? null,
      targetAvatarUrl: os.profiles.avatarUrl(targetProfile),
      mediaUrl: media ? os.storage.url(media.cid) : null,
    };
  });
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
  const profiles = await os.query.profiles.statsForAccounts(participantIds);
  return enrichEndorsementsFromProfiles(os, endorsements, profiles);
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
  const [bundle, viewerToTarget] = await Promise.all([
    os.endorsements.previewBundle(accountId, {
      limit: ENDORSEMENT_PREVIEW_LIMIT,
    }),
    viewerAccountId && viewerAccountId !== accountId
      ? listViewerEndorsementsToTarget(os, viewerAccountId, accountId)
      : Promise.resolve([]),
  ]);

  const received = enrichEndorsementsFromProfiles(
    os,
    bundle.received.map(parseEndorsementRow),
    bundle.profiles
  );
  const given = enrichEndorsementsFromProfiles(
    os,
    bundle.given.map(parseEndorsementRow),
    bundle.profiles
  );

  return {
    counts: bundle.counts,
    received,
    given,
    viewerToTarget,
  };
}
