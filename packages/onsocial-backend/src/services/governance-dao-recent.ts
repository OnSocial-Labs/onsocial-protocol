import { config } from '../config/index.js';
import { viewContractAt } from './near.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';
import { ensureDaoProposalsSynced } from './governance-dao-proposal-sync.js';
import {
  loadRecentDaoProposalSnapshots,
  type PersistedDaoProposalSnapshot,
} from './governance-dao-proposal-store.js';

const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 40;

function readRecentLimit(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_RECENT_LIMIT;
  }

  return Math.min(Math.trunc(parsed), MAX_RECENT_LIMIT);
}

export async function getDaoGovernanceRecent(
  daoAccountId: string = config.governanceDao,
  limitInput: unknown = DEFAULT_RECENT_LIMIT
): Promise<{
  daoAccountId: string;
  limit: number;
  proposals: PersistedDaoProposalSnapshot[];
  daoPolicy: GovernanceDaoPolicySnapshot | null;
}> {
  const limit = readRecentLimit(limitInput);

  await ensureDaoProposalsSynced(daoAccountId);

  const [storedRows, daoPolicy] = await Promise.all([
    loadRecentDaoProposalSnapshots(daoAccountId, limit),
    viewContractAt<GovernanceDaoPolicySnapshot>(
      daoAccountId,
      'get_policy',
      {}
    ).catch(() => null),
  ]);

  return {
    daoAccountId,
    limit,
    proposals: storedRows.map((row) => row.proposalSnapshot),
    daoPolicy,
  };
}
