import { config } from '../config/index.js';
import { viewContractAt } from './near.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';

export async function getDaoGovernancePolicy(
  daoAccountId: string = config.governanceDao
): Promise<GovernanceDaoPolicySnapshot | null> {
  return viewContractAt<GovernanceDaoPolicySnapshot>(
    daoAccountId,
    'get_policy',
    {}
  ).catch(() => null);
}
