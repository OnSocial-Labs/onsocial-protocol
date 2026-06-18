import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';
import { isEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';

export interface PortalEndorsementSupportPreviewSupporter {
  accountId: string;
  avatarUrl: string | null;
  totalAmountYocto: string;
}

export interface PortalEndorsementSupportTotal {
  totalAmountYocto: string;
  spendCount: number;
  supporterCount: number;
  previewSupporters: PortalEndorsementSupportPreviewSupporter[];
}

export function normalizeEndorsementSupportId(
  endorsementId: string
): string | null {
  const trimmed = endorsementId.trim();
  if (!isEndorsementSpendTargetId(trimmed)) {
    return null;
  }
  return trimmed;
}

export async function loadPortalEndorsementSupportTotal(
  endorsementId: string
): Promise<PortalEndorsementSupportTotal> {
  const normalized = normalizeEndorsementSupportId(endorsementId);
  if (!normalized) {
    throw new Error('A valid endorsementId query parameter is required');
  }

  const os = createPortalServerOnSocialClient();
  const summary = await os.query.socialSpend.endorsementSupportSummary(
    normalized,
    {
      previewLimit: 3,
    }
  );

  const previewIds = summary.previewSupporters.map((row) => row.accountId);
  if (previewIds.length === 0) {
    return {
      totalAmountYocto: summary.totalAmountYocto,
      spendCount: summary.spendCount,
      supporterCount: summary.supporterCount,
      previewSupporters: [],
    };
  }

  const enrichment = await os.standings.enrichPeers(null, previewIds);
  const profiles = new Map(
    enrichment.profiles.map((row) => [row.accountId, row] as const)
  );

  const previewSupporters = summary.previewSupporters.map((row) => {
    const profile = profiles.get(row.accountId) ?? null;
    const materialised: MaterialisedProfile | null = profile
      ? profileSearchRowToMaterialised(profile)
      : null;

    return {
      accountId: row.accountId,
      avatarUrl: os.profiles.avatarUrl(materialised),
      totalAmountYocto: row.totalAmountYocto,
    };
  });

  return {
    totalAmountYocto: summary.totalAmountYocto,
    spendCount: summary.spendCount,
    supporterCount: summary.supporterCount,
    previewSupporters,
  };
}
