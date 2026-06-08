import {
  fetchWithRetry,
  getDaoPolicyAtBlockCached,
} from './governance-policy-block-cache.js';
import {
  loadPersistedPolicySnapshotsByProposalIds,
  persistProposalPolicySnapshot,
} from './governance-proposal-policy-store.js';
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

type ProposalPolicySnapshotSource = {
  id?: number;
  status?: string;
  last_actions_log?: Array<{ block_height?: string | number }>;
};

/** Load durable snapshots first, then RPC+archival, persisting new captures. */
export async function resolveProposalPolicySnapshotsForRecords(
  daoAccountId: string,
  proposals: ProposalPolicySnapshotSource[]
): Promise<Map<number, GovernanceDaoPolicySnapshot>> {
  const terminalProposals = proposals.filter(
    (proposal) =>
      typeof proposal.id === 'number' &&
      proposal.id >= 0 &&
      isTerminalDaoProposalStatus(proposal.status)
  );

  const proposalIds = terminalProposals
    .map((proposal) => proposal.id)
    .filter((proposalId): proposalId is number => proposalId !== undefined);

  const persistedByProposalId = await loadPersistedPolicySnapshotsByProposalIds(
    daoAccountId,
    proposalIds
  );

  const proposalsNeedingFetch = terminalProposals.filter(
    (proposal) =>
      typeof proposal.id === 'number' && !persistedByProposalId.has(proposal.id)
  );

  const blockHeights = proposalsNeedingFetch
    .map((proposal) => readProposalSubmissionBlockHeight(proposal))
    .filter((height): height is number => height !== null);

  const policyByBlock = await loadDaoPolicySnapshotsByBlock(
    daoAccountId,
    blockHeights
  );

  const policyByProposalId = new Map<number, GovernanceDaoPolicySnapshot>(
    persistedByProposalId
  );
  const persistTasks: Array<Promise<void>> = [];

  for (const proposal of proposalsNeedingFetch) {
    if (typeof proposal.id !== 'number') {
      continue;
    }

    const policySnapshot = resolveProposalPolicySnapshot(
      proposal,
      policyByBlock
    );
    if (!policySnapshot) {
      continue;
    }

    policyByProposalId.set(proposal.id, policySnapshot);

    const submissionBlockHeight = readProposalSubmissionBlockHeight(proposal);
    if (submissionBlockHeight !== null) {
      persistTasks.push(
        persistProposalPolicySnapshot({
          daoAccountId,
          proposalId: proposal.id,
          submissionBlockHeight,
          policySnapshot,
        })
      );
    }
  }

  await Promise.allSettled(persistTasks);

  return policyByProposalId;
}
