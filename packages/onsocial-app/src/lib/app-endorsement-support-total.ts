import { createAppOnSocialClient } from '@/lib/profile-social-server';
import { isEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';

export interface AppEndorsementSupportPreviewSupporter {
  accountId: string;
  avatarUrl: string | null;
  totalAmountYocto: string;
}

export interface AppEndorsementSupportTotal {
  totalAmountYocto: string;
  spendCount: number;
  supporterCount: number;
  previewSupporters: AppEndorsementSupportPreviewSupporter[];
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

export async function loadAppEndorsementSupportTotal(
  endorsementId: string
): Promise<AppEndorsementSupportTotal> {
  const normalized = normalizeEndorsementSupportId(endorsementId);
  if (!normalized) {
    throw new Error('A valid endorsementId query parameter is required');
  }

  const os = createAppOnSocialClient();
  const summary = await os.query.socialSpend.endorsementSupportSummary(
    normalized,
    { previewLimit: 3 }
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

  const profiles = await os.query.profiles
    .statsForAccounts(previewIds)
    .catch(() => []);
  const byId = new Map(profiles.map((row) => [row.accountId, row] as const));

  return {
    totalAmountYocto: summary.totalAmountYocto,
    spendCount: summary.spendCount,
    supporterCount: summary.supporterCount,
    previewSupporters: summary.previewSupporters.map((row) => ({
      accountId: row.accountId,
      avatarUrl: byId.get(row.accountId)?.avatar ?? null,
      totalAmountYocto: row.totalAmountYocto,
    })),
  };
}
