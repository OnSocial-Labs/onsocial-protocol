import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import {
  buildGovernancePathWithBoard,
  resolveGovernanceDaoBoard,
} from '@/features/governance/governance-dao-board';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import type { SeasonTreasurySeedSource } from '@/features/season/season-zero-types';

export function resolveTreasurySeedHref(
  source: SeasonTreasurySeedSource | null | undefined
): string | null {
  if (!source) return null;

  if (source.kind === 'proposal') {
    const proposalPath = buildGovernanceProposalPath(
      source.appId,
      source.proposalId
    );
    const [pathname] = proposalPath.split('?');
    return buildGovernancePathWithBoard(
      pathname,
      resolveGovernanceDaoBoard(source.daoAccountId),
      { proposal: String(source.proposalId) }
    );
  }

  const txHash = source.txHash.trim();
  return txHash ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${txHash}` : null;
}
