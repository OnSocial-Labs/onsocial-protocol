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

function readProposalActionBlockHeights(
  proposal: Pick<GovernanceDaoProposal, 'last_actions_log'>
): number[] {
  return (proposal.last_actions_log ?? [])
    .map((entry) => Number(entry.block_height))
    .filter((height) => Number.isFinite(height) && height > 0);
}

export function readProposalSubmissionBlockHeight(
  proposal: Pick<GovernanceDaoProposal, 'last_actions_log'>
): number | null {
  const heights = readProposalActionBlockHeights(proposal);
  if (heights.length === 0) {
    return null;
  }

  return Math.min(...heights);
}

export function readProposalLastActionBlockHeight(
  proposal: Pick<GovernanceDaoProposal, 'last_actions_log'>
): number | null {
  const heights = readProposalActionBlockHeights(proposal);
  if (heights.length === 0) {
    return null;
  }

  return Math.max(...heights);
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
