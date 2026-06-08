import 'server-only';

import {
  readProposalLastActionBlockHeight,
  readProposalSubmissionBlockHeight,
} from '@/features/governance/governance-proposal-policy-snapshot';
import type { GovernanceDaoProposal } from '@/features/governance/types';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { loadBlockTimestampNanoseconds } from '@/lib/near-rpc';

const TERMINAL_STATUSES = new Set<GovernanceDaoProposal['status']>([
  'Approved',
  'Rejected',
  'Removed',
  'Failed',
  'Expired',
  'Moved',
]);

function isTerminalStatus(
  status: GovernanceDaoProposal['status'] | string | null | undefined
): status is GovernanceDaoProposal['status'] {
  return (
    !!status && TERMINAL_STATUSES.has(status as GovernanceDaoProposal['status'])
  );
}

function normalizeIndexedTimestamp(
  value: number | null | undefined
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value > 1_000_000_000_000_000) {
    return String(Math.trunc(value));
  }

  if (value < 1_000_000_000_000) {
    return String(Math.trunc(value * 1_000_000));
  }

  return String(Math.trunc(value * 1_000_000));
}

async function loadResolvedAtFromIndexedEvents(
  proposalId: number,
  daoAccountId: string
): Promise<string | null> {
  try {
    const os = createPortalOnSocialClient();
    const events = await os.query.governance.proposal(
      daoAccountId,
      String(proposalId),
      { limit: 200 }
    );
    const statusUpdates = events.filter(
      (event) => event.operation === 'proposal_status_updated'
    );

    if (statusUpdates.length === 0) {
      return null;
    }

    const latest = statusUpdates[statusUpdates.length - 1];
    return normalizeIndexedTimestamp(latest.blockTimestamp);
  } catch {
    return null;
  }
}

async function loadResolvedAtFromLastActionBlock(
  proposal: GovernanceDaoProposal
): Promise<string | null> {
  const submissionBlock = readProposalSubmissionBlockHeight(proposal);
  const lastActionBlock = readProposalLastActionBlockHeight(proposal);

  if (
    submissionBlock === null ||
    lastActionBlock === null ||
    lastActionBlock <= submissionBlock
  ) {
    return null;
  }

  return loadBlockTimestampNanoseconds(lastActionBlock);
}

export async function resolveProposalResolvedAt(
  proposal: GovernanceDaoProposal,
  daoAccountId: string
): Promise<string | null> {
  if (proposal.resolved_at) {
    return proposal.resolved_at;
  }

  if (!isTerminalStatus(proposal.status)) {
    return null;
  }

  const fromLastAction = await loadResolvedAtFromLastActionBlock(proposal);
  if (fromLastAction) {
    return fromLastAction;
  }

  if (typeof proposal.id !== 'number') {
    return null;
  }

  return loadResolvedAtFromIndexedEvents(proposal.id, daoAccountId);
}

export async function enrichDaoProposalWithResolvedAt(
  proposal: GovernanceDaoProposal | null,
  daoAccountId: string
): Promise<GovernanceDaoProposal | null> {
  if (!proposal || proposal.resolved_at || !isTerminalStatus(proposal.status)) {
    return proposal;
  }

  const resolvedAt = await resolveProposalResolvedAt(proposal, daoAccountId);
  if (!resolvedAt) {
    return proposal;
  }

  return {
    ...proposal,
    resolved_at: resolvedAt,
  };
}
