import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';

export interface PortalEndorsementSupportGivenRow {
  endorsementId: string;
  recipientId: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
  issuer: string | null;
  topic: string | null;
  recipientName: string | null;
  recipientAvatarUrl: string | null;
  issuerName: string | null;
  issuerAvatarUrl: string | null;
}

export interface PortalEndorsementSupportGivenPage {
  items: PortalEndorsementSupportGivenRow[];
  total: number;
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
      recipientName: recipientProfile?.name ?? null,
      recipientAvatarUrl: os.profiles.avatarUrl(recipientMaterialised),
      issuerName: issuerProfile?.name ?? null,
      issuerAvatarUrl: os.profiles.avatarUrl(issuerMaterialised),
    };
  });

  return {
    items,
    total: items.length,
  };
}
