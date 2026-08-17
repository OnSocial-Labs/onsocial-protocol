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

export function buildProtocolSearchText(
  application: ProtocolApplication
): string {
  const proposal = resolveLiveProposal(application);
  const parts = [
    application.label,
    application.app_id,
    application.description,
    application.protocol_kind,
    application.protocol_subject,
    application.protocol_target_account,
    application.protocol_target_method,
    application.governance_proposal?.description,
    application.governance_proposal?.proposer,
    application.governance_proposal?.dao_account,
    proposal?.proposer,
    proposal?.description,
    proposal?.id != null ? String(proposal.id) : null,
    application.governance_proposal?.proposal_id != null
      ? String(application.governance_proposal.proposal_id)
      : null,
  ];
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .toLowerCase();
}

/**
 * Filter feed rows by status chip and optional search query.
 * `open` = InProgress (not soft-expired).
 */
export function filterProtocolApplications(
  applications: ProtocolApplication[],
  status: ProtocolFeedStatusFilter,
  opts?: {
    isSoftExpired?: (application: ProtocolApplication) => boolean;
    searchQuery?: string | null;
  }
): ProtocolApplication[] {
  const query = opts?.searchQuery?.trim().toLowerCase() ?? '';
  return applications.filter((application) => {
    if (query) {
      const haystack = buildProtocolSearchText(application);
      if (!haystack.includes(query)) return false;
    }

    if (status === 'all') return true;

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
    searchQuery?: string | null;
  }
): Record<ProtocolFeedStatusFilter, number> {
  const scoped = filterProtocolApplications(applications, 'all', {
    searchQuery: opts?.searchQuery,
  });
  const counts: Record<ProtocolFeedStatusFilter, number> = {
    open: 0,
    approved: 0,
    rejected: 0,
    removed: 0,
    expired: 0,
    failed: 0,
    moved: 0,
    all: scoped.length,
  };
  for (const application of scoped) {
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

/** Portal parity — first paint a short batch, reveal more on scroll. */
export const PROTOCOL_FEED_PAGE_SIZE = 10;

export function getVisibleProtocolBatch<T>(
  items: T[],
  visibleCount: number,
  batchSize: number = PROTOCOL_FEED_PAGE_SIZE
) {
  const shownCount = Math.min(Math.max(0, visibleCount), items.length);
  return {
    visibleItems: items.slice(0, shownCount),
    hasMore: shownCount < items.length,
    shownCount,
    batchSize,
  };
}
