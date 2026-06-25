import type { EndorsementRecord, MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';

export interface PortalEndorsementSupportGivenRow {
  endorsementId: string;
  recipientId: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
  issuer: string | null;
  topic: string | null;
  note: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  recipientName: string | null;
  recipientAvatarUrl: string | null;
  issuerName: string | null;
  issuerAvatarUrl: string | null;
}

export interface PortalEndorsementSupportGivenPage {
  items: PortalEndorsementSupportGivenRow[];
  total: number;
}

function endorsementLookupKey(input: {
  target: string;
  issuer: string;
  topic: string | null;
}): string {
  return `${input.target}|${input.issuer}|${input.topic ?? ''}`;
}

function endorsementContentFromRecord(record: EndorsementRecord | null): {
  note: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
} {
  if (!record) {
    return { note: null, mediaUrl: null, mediaMime: null };
  }

  const media = parseEndorsementMediaRef(record.media);
  return {
    note: record.note?.trim() || null,
    mediaUrl: resolveEndorsementDisplayMediaUrl(
      { media: record.media },
      ACTIVE_NEAR_NETWORK
    ),
    mediaMime: media?.mime ?? null,
  };
}

async function loadEndorsementContents(
  os: ReturnType<typeof createPortalServerOnSocialClient>,
  lookups: Array<{ target: string; issuer: string; topic: string | null }>
): Promise<
  Map<
    string,
    { note: string | null; mediaUrl: string | null; mediaMime: string | null }
  >
> {
  const unique = new Map<
    string,
    { target: string; issuer: string; topic: string | null }
  >();

  for (const lookup of lookups) {
    if (!lookup.target || !lookup.issuer) continue;
    const key = endorsementLookupKey(lookup);
    if (!unique.has(key)) unique.set(key, lookup);
  }

  const settled = await Promise.allSettled(
    Array.from(unique.entries()).map(async ([key, lookup]) => {
      const record = await os.endorsements
        .get(lookup.target, {
          issuer: lookup.issuer,
          topic: lookup.topic ?? undefined,
        })
        .catch(() => null);
      return [key, endorsementContentFromRecord(record)] as const;
    })
  );

  const contents = new Map<
    string,
    { note: string | null; mediaUrl: string | null; mediaMime: string | null }
  >();

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      contents.set(result.value[0], result.value[1]);
    }
  }

  return contents;
}

export async function loadPortalEndorsementSupportGiven(
  accountId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<PortalEndorsementSupportGivenPage> {
  const spenderAccountId = accountId.trim();
  if (!spenderAccountId) {
    throw new Error('A valid accountId query parameter is required');
  }

  const os = createPortalServerOnSocialClient();
  const rows = await os.query.socialSpend.endorsementSupportGiven(
    spenderAccountId,
    {
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    }
  );

  const accountIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        [row.recipientId, row.issuer].filter((value): value is string =>
          Boolean(value?.trim())
        )
      )
    )
  );

  const profiles =
    accountIds.length > 0
      ? new Map(
          (await os.standings.enrichPeers(null, accountIds)).profiles.map(
            (row) => [row.accountId, row] as const
          )
        )
      : new Map();

  const items = rows.map((row) => {
    const recipientProfile = row.recipientId
      ? (profiles.get(row.recipientId) ?? null)
      : null;
    const issuerProfile = row.issuer
      ? (profiles.get(row.issuer) ?? null)
      : null;
    const recipientMaterialised: MaterialisedProfile | null = recipientProfile
      ? profileSearchRowToMaterialised(recipientProfile)
      : null;
    const issuerMaterialised: MaterialisedProfile | null = issuerProfile
      ? profileSearchRowToMaterialised(issuerProfile)
      : null;

    return {
      endorsementId: row.endorsementId,
      recipientId: row.recipientId,
      totalAmountYocto: row.totalAmountYocto,
      spendCount: row.spendCount,
      latestSupportAt: row.latestSupportAt,
      issuer: row.issuer,
      topic: row.topic,
      note: null as string | null,
      mediaUrl: null as string | null,
      mediaMime: null as string | null,
      recipientName: recipientProfile?.name ?? null,
      recipientAvatarUrl: os.profiles.avatarUrl(recipientMaterialised),
      issuerName: issuerProfile?.name ?? null,
      issuerAvatarUrl: os.profiles.avatarUrl(issuerMaterialised),
    };
  });

  const endorsementContents = await loadEndorsementContents(
    os,
    items.flatMap((row) => {
      const target = row.recipientId?.trim() ?? '';
      const issuer = row.issuer?.trim() ?? '';
      if (!target || !issuer) return [];
      return [{ target, issuer, topic: row.topic }];
    })
  );

  const enrichedItems = items.map((row) => {
    const target = row.recipientId?.trim() ?? '';
    const issuer = row.issuer?.trim() ?? '';
    if (!target || !issuer) return row;

    const content =
      endorsementContents.get(
        endorsementLookupKey({ target, issuer, topic: row.topic })
      ) ?? null;

    return {
      ...row,
      note: content?.note ?? null,
      mediaUrl: content?.mediaUrl ?? null,
      mediaMime: content?.mediaMime ?? null,
    };
  });

  return {
    items: enrichedItems,
    total: enrichedItems.length,
  };
}
