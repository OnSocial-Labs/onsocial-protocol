import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  isProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';
import { normalizeEndorsementSupportId } from '@/lib/portal-endorsement-support-total';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';

export interface PortalEndorsementSupporterSummary {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
}

export interface PortalEndorsementSupportersPage {
  supporters: PortalEndorsementSupporterSummary[];
  total: number;
}

export async function loadPortalEndorsementSupporters(
  endorsementId: string,
  viewerAccountId: string | null,
  searchQuery?: string | null
): Promise<PortalEndorsementSupportersPage> {
  const normalized = normalizeEndorsementSupportId(endorsementId);
  if (!normalized) {
    throw new Error('A valid endorsementId query parameter is required');
  }

  const os = createPortalServerOnSocialClient();
  let aggregates = await os.query.socialSpend.endorsementSupporters(normalized);

  if (isProfileSearchQuery(searchQuery)) {
    const matches = new Set(await searchMatchingAccountIds(os, searchQuery));
    aggregates = aggregates.filter((row) => matches.has(row.accountId));
  }

  const accountIds = aggregates.map((row) => row.accountId);
  if (accountIds.length === 0) {
    return { supporters: [], total: 0 };
  }

  const enrichment = await os.standings.enrichPeers(
    viewerAccountId,
    accountIds
  );
  const profiles = new Map(
    enrichment.profiles.map((row) => [row.accountId, row] as const)
  );
  const viewerOutgoingSet = new Set(enrichment.viewerOutgoingPeerIds);
  const viewerIncomingSet = new Set(enrichment.viewerIncomingPeerIds);

  const supporters = aggregates.map((row) => {
    const profile = profiles.get(row.accountId);
    const materialised: MaterialisedProfile | null = profile
      ? profileSearchRowToMaterialised(profile)
      : null;

    return {
      accountId: row.accountId,
      name: profile?.name ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: os.profiles.avatarUrl(materialised),
      totalAmountYocto: row.totalAmountYocto,
      spendCount: row.spendCount,
      latestSupportAt: row.latestSupportAt,
      viewerStanding: viewerOutgoingSet.has(row.accountId),
      theyStandWithViewer: viewerIncomingSet.has(row.accountId),
    };
  });

  return {
    supporters,
    total: supporters.length,
  };
}
