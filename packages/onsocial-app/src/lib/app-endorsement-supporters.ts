import type {
  EndorsementSupporterAggregate,
  ProfileSearchRow,
} from '@onsocial/sdk';
import { createAppOnSocialClient } from '@/lib/profile-social-server';
import { normalizeEndorsementSupportId } from '@/lib/app-endorsement-support-total';

export interface AppEndorsementSupporter {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
}

export interface AppEndorsementSupportersPage {
  endorsementId: string;
  supporters: AppEndorsementSupporter[];
  total: number;
}

export function enrichEndorsementSupporters(
  aggregates: EndorsementSupporterAggregate[],
  profiles: Array<Pick<ProfileSearchRow, 'accountId' | 'name' | 'avatar'>>
): AppEndorsementSupporter[] {
  const byId = new Map(profiles.map((row) => [row.accountId, row] as const));
  return aggregates.map((row) => {
    const profile = byId.get(row.accountId);
    return {
      accountId: row.accountId,
      name: profile?.name ?? null,
      avatarUrl: profile?.avatar ?? null,
      totalAmountYocto: row.totalAmountYocto,
      spendCount: row.spendCount,
      latestSupportAt: row.latestSupportAt,
    };
  });
}

export async function loadAppEndorsementSupporters(
  endorsementId: string
): Promise<AppEndorsementSupportersPage> {
  const normalized = normalizeEndorsementSupportId(endorsementId);
  if (!normalized) {
    throw new Error('A valid endorsementId query parameter is required');
  }

  const os = createAppOnSocialClient();
  const aggregates = await os.query.socialSpend.endorsementSupporters(
    normalized
  );
  if (aggregates.length === 0) {
    return { endorsementId: normalized, supporters: [], total: 0 };
  }

  const profiles = await os.query.profiles
    .statsForAccounts(aggregates.map((row) => row.accountId))
    .catch(() => []);

  const supporters = enrichEndorsementSupporters(aggregates, profiles);
  return {
    endorsementId: normalized,
    supporters,
    total: supporters.length,
  };
}
