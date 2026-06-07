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
  return viewContractAt<GovernanceDaoProposal>(
    daoAccountId,
    'get_proposal',
    { id: proposalId }
  ).catch(() => null);
}

export async function loadRewardsAppConfig(
  appId: string
): Promise<OnChainAppConfig | null> {
  return viewContractAt<OnChainAppConfig>(REWARDS_CONTRACT, 'get_app_config', {
    app_id: appId,
  }).catch(() => null);
}
