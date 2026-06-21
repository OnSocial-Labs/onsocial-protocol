import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import type { SeasonTreasurySeedSource } from '@/features/season/season-zero-types';

export function resolveTreasurySeedHref(
  source: SeasonTreasurySeedSource | null | undefined
): string | null {
  if (!source) return null;

  if (source.kind === 'proposal') {
    return buildGovernanceProposalPath(source.appId, source.proposalId);
  }

  const txHash = source.txHash.trim();
  return txHash ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${txHash}` : null;
}
