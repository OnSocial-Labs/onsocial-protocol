import type { MaterialisedProfile } from '@onsocial/sdk';
import { parseLegacyEndorsementSpendTargetId } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';
import { normalizeEndorsementSupportId } from '@/lib/portal-endorsement-support-total';

export interface PortalEndorsementSupportPreviewSupporter {
  accountId: string;
  avatarUrl: string | null;
  totalAmountYocto: string;
}

export interface PortalEndorsementSupportContext {
  endorsementId: string;
  totalAmountYocto: string;
  supporterCount: number;
  issuer: string;
  target: string;
  topic: string | null;
  note: string | null;
  issuerName: string | null;
  targetName: string | null;
  issuerAvatarUrl: string | null;
  targetAvatarUrl: string | null;
  previewSupporters: PortalEndorsementSupportPreviewSupporter[];
}

function resolveEndorsementParties(input: {
  endorsementId: string;
  issuer?: string | null;
  target?: string | null;
  topic?: string | null;
}): { issuer: string; target: string; topic: string | null } {
  const issuer = input.issuer?.trim() ?? '';
  const target = input.target?.trim() ?? '';
  if (issuer && target) {
    return {
      issuer,
      target,
      topic: input.topic?.trim() || null,
    };
  }

  const legacy = parseLegacyEndorsementSpendTargetId(input.endorsementId);
  if (legacy) {
    return {
      issuer: legacy.issuer,
      target: legacy.target,
      topic: input.topic?.trim() || legacy.topic || null,
    };
  }

  return {
    issuer,
    target,
    topic: input.topic?.trim() || null,
  };
}

async function enrichPreviewSupporters(
  os: ReturnType<typeof createPortalServerOnSocialClient>,
  previewSupporters: Array<{ accountId: string; totalAmountYocto: string }>
): Promise<PortalEndorsementSupportPreviewSupporter[]> {
  if (previewSupporters.length === 0) return [];

  const enrichment = await os.standings.enrichPeers(
    null,
    previewSupporters.map((row) => row.accountId)
  );
  const profiles = new Map(
    enrichment.profiles.map((row) => [row.accountId, row] as const)
  );

  return previewSupporters.map((row) => {
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
}

export async function loadPortalEndorsementSupportContext(input: {
  endorsementId: string;
  issuer?: string | null;
  target?: string | null;
  topic?: string | null;
}): Promise<PortalEndorsementSupportContext> {
  const normalized = normalizeEndorsementSupportId(input.endorsementId);
  if (!normalized) {
    throw new Error('A valid endorsementId query parameter is required');
  }

  const parties = resolveEndorsementParties({
    endorsementId: normalized,
    issuer: input.issuer,
    target: input.target,
    topic: input.topic,
  });

  const os = createPortalServerOnSocialClient();
  const summary = await os.query.socialSpend.endorsementSupportSummary(
    normalized,
    { previewLimit: 3 }
  );

  if (!parties.issuer || !parties.target) {
    return {
      endorsementId: normalized,
      totalAmountYocto: summary.totalAmountYocto,
      supporterCount: summary.supporterCount,
      issuer: parties.issuer,
      target: parties.target,
      topic: parties.topic,
      note: null,
      issuerName: null,
      targetName: null,
      issuerAvatarUrl: null,
      targetAvatarUrl: null,
      previewSupporters: await enrichPreviewSupporters(
        os,
        summary.previewSupporters
      ),
    };
  }

  const endorsementRecord = await os.endorsements
    .get(parties.target, {
      issuer: parties.issuer,
      topic: parties.topic ?? undefined,
    })
    .catch(() => null);

  const previewIds = summary.previewSupporters.map((row) => row.accountId);
  const accountIds = Array.from(
    new Set([parties.issuer, parties.target, ...previewIds])
  );

  const enrichment = await os.standings.enrichPeers(null, accountIds);
  const profiles = new Map(
    enrichment.profiles.map((row) => [row.accountId, row] as const)
  );

  const issuerProfile = profiles.get(parties.issuer) ?? null;
  const targetProfile = profiles.get(parties.target) ?? null;
  const issuerMaterialised: MaterialisedProfile | null = issuerProfile
    ? profileSearchRowToMaterialised(issuerProfile)
    : null;
  const targetMaterialised: MaterialisedProfile | null = targetProfile
    ? profileSearchRowToMaterialised(targetProfile)
    : null;

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
    endorsementId: normalized,
    totalAmountYocto: summary.totalAmountYocto,
    supporterCount: summary.supporterCount,
    issuer: parties.issuer,
    target: parties.target,
    topic: parties.topic,
    note: endorsementRecord?.note?.trim() || null,
    issuerName: issuerProfile?.name ?? null,
    targetName: targetProfile?.name ?? null,
    issuerAvatarUrl: os.profiles.avatarUrl(issuerMaterialised),
    targetAvatarUrl: os.profiles.avatarUrl(targetMaterialised),
    previewSupporters,
  };
}
