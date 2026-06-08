import {
  fetchWithRetry,
  getDaoPolicyAtBlockCached,
} from './governance-policy-block-cache.js';
import { viewContractAtBlock } from './near.js';

export type GovernanceDaoPolicySnapshot = {
  roles?: unknown[];
  default_vote_policy?: unknown;
  proposal_bond?: string;
  proposal_period?: string;
};

const TERMINAL_DAO_PROPOSAL_STATUSES = new Set([
  'Approved',
  'Rejected',
  'Removed',
  'Failed',
  'Expired',
  'Moved',
]);

export function isTerminalDaoProposalStatus(
  status: string | null | undefined
): boolean {
  return !!status && TERMINAL_DAO_PROPOSAL_STATUSES.has(status);
}

export function readProposalSubmissionBlockHeight(proposal: {
  last_actions_log?: Array<{ block_height?: string | number }>;
}): number | null {
  const heights = (proposal.last_actions_log ?? [])
    .map((entry) => Number(entry.block_height))
    .filter((height) => Number.isFinite(height) && height > 0);

  if (heights.length === 0) {
    return null;
  }

  return Math.min(...heights);
}

export async function loadDaoPolicySnapshotsByBlock(
  daoAccountId: string,
  blockHeights: number[]
): Promise<Map<number, GovernanceDaoPolicySnapshot>> {
  const uniqueHeights = [...new Set(blockHeights)];
  const snapshots = new Map<number, GovernanceDaoPolicySnapshot>();

  await Promise.all(
    uniqueHeights.map(async (blockHeight) => {
      const policy = await getDaoPolicyAtBlockCached(
        daoAccountId,
        blockHeight,
        () =>
          fetchWithRetry(() =>
            viewContractAtBlock<GovernanceDaoPolicySnapshot>(
              daoAccountId,
              'get_policy',
              {},
              blockHeight
            )
          )
      );
      if (policy) {
        snapshots.set(blockHeight, policy);
      }
    })
  );

  return snapshots;
}

export function resolveProposalPolicySnapshot(
  proposal: {
    status?: string;
    last_actions_log?: Array<{ block_height?: string | number }>;
  },
  policyByBlock: Map<number, GovernanceDaoPolicySnapshot>
): GovernanceDaoPolicySnapshot | null {
  if (!isTerminalDaoProposalStatus(proposal.status)) {
    return null;
  }

  const blockHeight = readProposalSubmissionBlockHeight(proposal);
  if (blockHeight === null) {
    return null;
  }

  return policyByBlock.get(blockHeight) ?? null;
}
