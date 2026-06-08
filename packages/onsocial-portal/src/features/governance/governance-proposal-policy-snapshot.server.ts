import 'server-only';

import { getDaoPolicyAtBlockCached } from '@/features/governance/governance-policy-block-cache';
import {
  readProposalSubmissionBlockHeight,
} from '@/features/governance/governance-proposal-policy-snapshot';
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
