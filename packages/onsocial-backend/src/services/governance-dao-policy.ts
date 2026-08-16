import { config } from '../config/index.js';
import { viewContractAt } from './near.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';
import { indexDaoMembershipsFromPolicy } from './governance-dao-membership-sync.js';

export async function getDaoGovernancePolicy(
  daoAccountId: string = config.governanceDao
): Promise<GovernanceDaoPolicySnapshot | null> {
  const daoPolicy = await viewContractAt<GovernanceDaoPolicySnapshot>(
    daoAccountId,
    'get_policy',
    {}
  ).catch(() => null);
  void indexDaoMembershipsFromPolicy(daoAccountId, daoPolicy);
  return daoPolicy;
}
