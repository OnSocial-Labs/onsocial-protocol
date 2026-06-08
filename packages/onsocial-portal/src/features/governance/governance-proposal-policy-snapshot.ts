import { getDaoPolicyAtBlockCached } from '@/features/governance/governance-policy-block-cache';
import { loadPersistedProposalPolicySnapshot } from '@/lib/governance-policy-snapshot-backend';
import { viewContractAtBlock } from '@/lib/near-rpc';
import type {
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
  GovernanceDaoProposalStatus,
} from '@/features/governance/types';

const TERMINAL_DAO_PROPOSAL_STATUSES = new Set<GovernanceDaoProposalStatus>([
  'Approved',
  'Rejected',
  'Removed',
  'Failed',
  'Expired',
  'Moved',
]);

function isTerminalDaoProposalStatus(
  status: GovernanceDaoProposal['status'] | string | null | undefined
): boolean {
  return (
    !!status &&
    TERMINAL_DAO_PROPOSAL_STATUSES.has(status as GovernanceDaoProposalStatus)
  );
}

export function readProposalSubmissionBlockHeight(
  proposal: Pick<GovernanceDaoProposal, 'last_actions_log'>
): number | null {
  const heights = (proposal.last_actions_log ?? [])
    .map((entry) => Number(entry.block_height))
    .filter((height) => Number.isFinite(height) && height > 0);

  if (heights.length === 0) {
    return null;
  }

  return Math.min(...heights);
}

async function loadDaoPolicySnapshotsByBlock(
  daoAccountId: string,
  blockHeights: number[]
): Promise<Map<number, GovernanceDaoPolicy>> {
  const uniqueHeights = [...new Set(blockHeights)];
  const snapshots = new Map<number, GovernanceDaoPolicy>();

  await Promise.all(
    uniqueHeights.map(async (blockHeight) => {
      const policy = await getDaoPolicyAtBlockCached(
        daoAccountId,
        blockHeight,
        () =>
          viewContractAtBlock<GovernanceDaoPolicy>(
            daoAccountId,
            'get_policy',
            {},
            blockHeight
          )
      );
      if (policy) {
        snapshots.set(blockHeight, policy);
      }
    })
  );

  return snapshots;
}

function resolveProposalPolicySnapshot(
  proposal: GovernanceDaoProposal,
  policyByBlock: Map<number, GovernanceDaoPolicy>
): GovernanceDaoPolicy | null {
  if (!isTerminalDaoProposalStatus(proposal.status)) {
    return null;
  }

  const blockHeight = readProposalSubmissionBlockHeight(proposal);
  if (blockHeight === null) {
    return null;
  }

  return policyByBlock.get(blockHeight) ?? null;
}

/** Attach submission-time policy to one resolved proposal. */
export async function enrichDaoProposalWithPolicySnapshot(
  proposal: GovernanceDaoProposal | null,
  daoAccountId: string
): Promise<GovernanceDaoProposal | null> {
  if (!proposal) {
    return null;
  }

  if (
    isTerminalDaoProposalStatus(proposal.status) &&
    !proposal.policy_snapshot &&
    typeof proposal.id === 'number'
  ) {
    const persistedPolicy = await loadPersistedProposalPolicySnapshot(
      proposal.id,
      daoAccountId
    );

    if (persistedPolicy) {
      return {
        ...proposal,
        policy_snapshot: persistedPolicy,
      };
    }
  }

  const [enriched] = await enrichDaoProposalsWithPolicySnapshots(
    [proposal],
    daoAccountId
  );
  return enriched;
}

export function hasFrozenProposalPolicySnapshot(
  proposal: GovernanceDaoProposal | null | undefined
): boolean {
  return Boolean(proposal?.policy_snapshot);
}

/** Resolved cards need frozen policy before showing derived vote rules. */
export function hasReliableVoteRuleContext(
  proposal: GovernanceDaoProposal | null | undefined,
  votingClosed: boolean
): boolean {
  if (!proposal || !votingClosed) {
    return true;
  }

  if (!isTerminalDaoProposalStatus(proposal.status)) {
    return true;
  }

  return hasFrozenProposalPolicySnapshot(proposal);
}

/** Attach submission-time policy to resolved proposals for accurate vote math. */
export async function enrichDaoProposalsWithPolicySnapshots(
  proposals: GovernanceDaoProposal[],
  daoAccountId: string
): Promise<GovernanceDaoProposal[]> {
  if (proposals.length === 0) {
    return proposals;
  }

  const proposalsWithPersistedPolicy = await Promise.all(
    proposals.map(async (proposal) => {
      if (
        proposal.policy_snapshot ||
        !isTerminalDaoProposalStatus(proposal.status) ||
        typeof proposal.id !== 'number'
      ) {
        return proposal;
      }

      const persistedPolicy = await loadPersistedProposalPolicySnapshot(
        proposal.id,
        daoAccountId
      );

      if (!persistedPolicy) {
        return proposal;
      }

      return {
        ...proposal,
        policy_snapshot: persistedPolicy,
      };
    })
  );

  const blockHeights = proposalsWithPersistedPolicy
    .filter((proposal) => !proposal.policy_snapshot)
    .map((proposal) => readProposalSubmissionBlockHeight(proposal))
    .filter((height): height is number => height !== null);
  const policyByBlock = await loadDaoPolicySnapshotsByBlock(
    daoAccountId,
    blockHeights
  );

  return proposalsWithPersistedPolicy.map((proposal) => {
    if (proposal.policy_snapshot) {
      return proposal;
    }

    const policySnapshot = resolveProposalPolicySnapshot(
      proposal,
      policyByBlock
    );
    if (!policySnapshot) {
      return proposal;
    }

    return {
      ...proposal,
      policy_snapshot: policySnapshot,
    };
  });
}

export function resolveEffectiveDaoPolicy(
  liveProposal: GovernanceDaoProposal | null,
  daoPolicy: GovernanceDaoPolicy | null,
  votingClosed: boolean
): GovernanceDaoPolicy | null {
  if (
    votingClosed &&
    liveProposal?.policy_snapshot &&
    isTerminalDaoProposalStatus(liveProposal.status)
  ) {
    return liveProposal.policy_snapshot;
  }

  return daoPolicy;
}
