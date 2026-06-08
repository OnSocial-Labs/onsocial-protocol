import {
  enrichDaoProposalWithPolicySnapshot,
  enrichDaoProposalsWithPolicySnapshots,
} from '@/features/governance/governance-proposal-policy-snapshot';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
import {
  REWARDS_CONTRACT,
  viewContractAt,
  type OnChainAppConfig,
} from '@/lib/near-rpc';
import type {
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

export async function loadDaoPolicy(
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceDaoPolicy | null> {
  return viewContractAt<GovernanceDaoPolicy>(daoAccountId, 'get_policy').catch(
    () => null
  );
}

export async function loadDaoProposal(
  proposalId: number,
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceDaoProposal | null> {
  const proposal = await viewContractAt<GovernanceDaoProposal>(
    daoAccountId,
    'get_proposal',
    { id: proposalId }
  ).catch(() => null);

  return enrichDaoProposalWithPolicySnapshot(proposal, daoAccountId);
}

export async function loadDaoRecentProposals(
  limit = 20,
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceDaoProposal[]> {
  const lastProposalId = await viewContractAt<number>(
    daoAccountId,
    'get_last_proposal_id',
    {}
  ).catch(() => null);

  if (typeof lastProposalId !== 'number' || lastProposalId < 0) {
    return [];
  }

  const fetchLimit = Math.min(lastProposalId + 1, Math.max(1, limit));
  const fromIndex = Math.max(0, lastProposalId + 1 - fetchLimit);
  const proposals = await viewContractAt<GovernanceDaoProposal[]>(
    daoAccountId,
    'get_proposals',
    { from_index: fromIndex, limit: fetchLimit }
  ).catch(() => []);

  if (!Array.isArray(proposals)) {
    return [];
  }

  const normalized = proposals
    .map((proposal, index) => ({
      ...proposal,
      id: proposal.id ?? fromIndex + index,
    }))
    .reverse();

  return enrichDaoProposalsWithPolicySnapshots(normalized, daoAccountId);
}

export async function loadRewardsAppConfig(
  appId: string
): Promise<OnChainAppConfig | null> {
  return viewContractAt<OnChainAppConfig>(REWARDS_CONTRACT, 'get_app_config', {
    app_id: appId,
  }).catch(() => null);
}
