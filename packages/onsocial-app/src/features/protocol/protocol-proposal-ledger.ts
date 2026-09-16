import {
  applyProtocolProposalSnapshot,
  isTerminalProtocolProposalStatus,
  mergeProtocolProposalSnapshot,
  protocolProposalCaughtUp,
  resolveLiveProposal,
} from '@/features/protocol/protocol-card-view';
import type {
  ProtocolApplication,
  ProtocolDaoProposal,
} from '@/features/protocol/types';

/** Confirmed vote/finalize snapshots until live `get_proposal` agrees. */
export type ProtocolProposalLedger = Map<string, ProtocolDaoProposal>;

const confirmedProposals: ProtocolProposalLedger = new Map();

export function protocolProposalLedgerKey(
  daoAccountId: string,
  proposalId: number
): string {
  return `${daoAccountId.trim().toLowerCase()}::${proposalId}`;
}

function readLockedProposal(
  daoAccountId: string,
  proposalId: number
): ProtocolDaoProposal | undefined {
  return confirmedProposals.get(
    protocolProposalLedgerKey(daoAccountId, proposalId)
  );
}

export function recordConfirmedProtocolProposal(
  daoAccountId: string,
  proposal: ProtocolDaoProposal
): void {
  const proposalId = proposal.id;
  if (proposalId == null || !Number.isFinite(proposalId)) return;
  const key = protocolProposalLedgerKey(daoAccountId, proposalId);
  const previous = confirmedProposals.get(key);
  confirmedProposals.set(
    key,
    mergeProtocolProposalSnapshot(previous, proposal) ?? proposal
  );
}

export function overlayConfirmedProtocolProposal(
  daoAccountId: string,
  proposal: ProtocolDaoProposal
): ProtocolDaoProposal {
  const proposalId = proposal.id;
  if (proposalId == null || !Number.isFinite(proposalId)) return proposal;
  const locked = readLockedProposal(daoAccountId, proposalId);
  if (!locked) return proposal;
  if (protocolProposalCaughtUp(locked, proposal)) {
    confirmedProposals.delete(
      protocolProposalLedgerKey(daoAccountId, proposalId)
    );
    return proposal;
  }
  const merged = mergeProtocolProposalSnapshot(locked, proposal) ?? locked;
  if (!isTerminalProtocolProposalStatus(locked.status)) return merged;
  if (locked.status === 'Approved' && merged.status === 'Failed') return merged;
  return { ...merged, status: locked.status };
}

export function overlayConfirmedProtocolApplication(
  daoAccountId: string,
  application: ProtocolApplication
): ProtocolApplication {
  const live = resolveLiveProposal(application);
  if (!live) return application;
  const overlaid = overlayConfirmedProtocolProposal(daoAccountId, live);
  if (overlaid === live) return application;
  return applyProtocolProposalSnapshot(application, overlaid);
}

export function overlayConfirmedProtocolApplications(
  daoAccountId: string,
  applications: ProtocolApplication[]
): ProtocolApplication[] {
  let changed = false;
  const next = applications.map((row) => {
    const overlaid = overlayConfirmedProtocolApplication(daoAccountId, row);
    if (overlaid !== row) changed = true;
    return overlaid;
  });
  return changed ? next : applications;
}

/** Test helper — drop all confirmed proposal locks. */
export function clearConfirmedProtocolProposalLedger(): void {
  confirmedProposals.clear();
}
