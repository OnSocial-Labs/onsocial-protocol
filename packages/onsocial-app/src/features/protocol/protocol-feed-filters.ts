import { resolveLiveProposal } from '@/features/protocol/protocol-card-view';
import type { ProtocolApplication } from '@/features/protocol/types';
import type { ProtocolFeedStatusFilter } from '@/lib/app-routes';

export const PROTOCOL_FEED_STATUS_OPTIONS: Array<{
  id: ProtocolFeedStatusFilter;
  label: string;
}> = [
  { id: 'open', label: 'Open' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'removed', label: 'Removed' },
  { id: 'expired', label: 'Expired' },
  { id: 'failed', label: 'Failed' },
  { id: 'moved', label: 'Moved' },
  { id: 'all', label: 'All' },
];

/**
 * Filter feed rows by status chip. `open` = InProgress (not soft-expired).
 */
export function filterProtocolApplications(
  applications: ProtocolApplication[],
  status: ProtocolFeedStatusFilter,
  opts?: {
    isSoftExpired?: (application: ProtocolApplication) => boolean;
  }
): ProtocolApplication[] {
  if (status === 'all') return applications;
  return applications.filter((application) => {
    const proposal = resolveLiveProposal(application);
    const raw = proposal?.status ?? application.governance_proposal?.status;
    const softExpired =
      raw === 'InProgress' && (opts?.isSoftExpired?.(application) ?? false);

    switch (status) {
      case 'open':
        return raw === 'InProgress' && !softExpired;
      case 'expired':
        return raw === 'Expired' || softExpired;
      case 'approved':
        return raw === 'Approved';
      case 'rejected':
        return raw === 'Rejected';
      case 'removed':
        return raw === 'Removed';
      case 'failed':
        return raw === 'Failed';
      case 'moved':
        return raw === 'Moved';
      default:
        return true;
    }
  });
}

export function countProtocolApplicationsByStatus(
  applications: ProtocolApplication[],
  opts?: {
    isSoftExpired?: (application: ProtocolApplication) => boolean;
  }
): Record<ProtocolFeedStatusFilter, number> {
  const counts: Record<ProtocolFeedStatusFilter, number> = {
    open: 0,
    approved: 0,
    rejected: 0,
    removed: 0,
    expired: 0,
    failed: 0,
    moved: 0,
    all: applications.length,
  };
  for (const application of applications) {
    const proposal = resolveLiveProposal(application);
    const raw = proposal?.status ?? application.governance_proposal?.status;
    const softExpired =
      raw === 'InProgress' && (opts?.isSoftExpired?.(application) ?? false);
    if (raw === 'InProgress' && !softExpired) counts.open += 1;
    else if (raw === 'Expired' || softExpired) counts.expired += 1;
    else if (raw === 'Approved') counts.approved += 1;
    else if (raw === 'Rejected') counts.rejected += 1;
    else if (raw === 'Removed') counts.removed += 1;
    else if (raw === 'Failed') counts.failed += 1;
    else if (raw === 'Moved') counts.moved += 1;
  }
  return counts;
}

export function findProtocolApplicationByProposalId(
  applications: ProtocolApplication[],
  proposalId: number
): ProtocolApplication | null {
  return (
    applications.find((row) => {
      const live = resolveLiveProposal(row);
      const id = live?.id ?? row.governance_proposal?.proposal_id;
      return id === proposalId;
    }) ?? null
  );
}
