import type { Application } from '@/features/governance/types';

export type GovernanceLane = 'all' | 'partners' | 'protocol';

export type GovernanceStatusFilter =
  | 'all'
  | 'open'
  | 'approved'
  | 'rejected'
  | 'removed'
  | 'expired'
  | 'failed'
  | 'moved';

export type GovernanceFeedItem = {
  app: Application;
  lane: Exclude<GovernanceLane, 'all'>;
  type: 'new_partner' | 'protocol';
  status: Exclude<GovernanceStatusFilter, 'all'>;
  statusLabel: string;
  searchText: string;
  createdAtMs: number;
  activityAtMs: number;
};

export const GOVERNANCE_PAGE_SIZE = 10;

export const LANE_OPTIONS: Array<{ value: GovernanceLane; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'partners', label: 'Partners' },
  { value: 'protocol', label: 'Protocol' },
];

export const STATUS_OPTIONS: Array<{
  value: GovernanceStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'removed', label: 'Removed' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
  { value: 'moved', label: 'Moved' },
];

export function parseLane(value: string | null): GovernanceLane {
  if (value === 'partners' || value === 'protocol') {
    return value;
  }

  return 'all';
}

export function parseStatusFilter(
  value: string | null
): GovernanceStatusFilter {
  switch (value) {
    case 'open':
    case 'approved':
    case 'rejected':
    case 'removed':
    case 'expired':
    case 'failed':
    case 'moved':
      return value;
    default:
      return 'all';
  }
}

export function parsePage(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function buildGovernanceFeedItems(
  apps: Application[],
  options?: { nowMs?: number; proposalPeriodNs?: string | null }
): GovernanceFeedItem[] {
  const nowMs = options?.nowMs ?? Date.now();
  const periodNs = options?.proposalPeriodNs ?? null;
  return apps
    .filter(
      (app) =>
        app.governance_proposal != null && app.status !== 'ready_for_governance'
    )
    .map((app) => buildGovernanceFeedItem(app, nowMs, periodNs));
}

export function getStatusCounts(
  items: GovernanceFeedItem[]
): Record<GovernanceStatusFilter, number> {
  return STATUS_OPTIONS.reduce<Record<GovernanceStatusFilter, number>>(
    (counts, option) => {
      counts[option.value] =
        option.value === 'all'
          ? items.length
          : items.filter((item) => item.status === option.value).length;
      return counts;
    },
    {
      all: 0,
      open: 0,
      approved: 0,
      rejected: 0,
      removed: 0,
      expired: 0,
      failed: 0,
      moved: 0,
    }
  );
}

export function getVisibleStatusOptions(
  statusCounts: Record<GovernanceStatusFilter, number>,
  activeStatus: GovernanceStatusFilter
) {
  return STATUS_OPTIONS.filter((option) => {
    if (
      option.value === 'all' ||
      option.value === 'open' ||
      option.value === 'approved'
    ) {
      return true;
    }

    return statusCounts[option.value] > 0 || activeStatus === option.value;
  });
}

export function filterGovernanceItems({
  items,
  lane,
  statusFilter,
  searchQuery,
}: {
  items: GovernanceFeedItem[];
  lane: GovernanceLane;
  statusFilter: GovernanceStatusFilter;
  searchQuery: string;
}) {
  const laneItems = items.filter((item) => {
    return lane === 'all' ? true : item.lane === lane;
  });
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = laneItems
    .filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (normalizedQuery && !item.searchText.includes(normalizedQuery)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.activityAtMs - left.activityAtMs);

  return {
    laneItems,
    filteredItems,
    normalizedQuery,
  };
}

export function getPaginatedItems<T>({
  items,
  currentPage,
  pageSize,
}: {
  items: T[];
  currentPage: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedItems = items.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  return {
    totalPages,
    safeCurrentPage,
    paginatedItems,
  };
}

export function getFilteredEmptyState(
  statusFilter: GovernanceStatusFilter,
  lane: GovernanceLane
): {
  title: string;
  detail: string;
} {
  const scopeLabel =
    lane === 'protocol'
      ? 'protocol'
      : lane === 'partners'
        ? 'partner'
        : 'governance';

  switch (statusFilter) {
    case 'open':
      return {
        title:
          lane === 'protocol'
            ? 'No open protocol proposals'
            : lane === 'partners'
              ? 'No open partner proposals'
              : 'No open governance proposals',
        detail:
          lane === 'protocol'
            ? 'Contract upgrades, treasury actions, permissions, and config proposals will appear here.'
            : lane === 'partners'
              ? 'New submissions, ready-to-open items, and live guardian review will appear here.'
              : 'New submissions and live guardian reviews will appear here.',
      };
    case 'approved':
      return {
        title: 'No approved proposals yet',
        detail:
          lane === 'protocol'
            ? 'Approved protocol actions will land here once governance finalizes them.'
            : lane === 'partners'
              ? 'Approved partner launches will land here once they clear governance.'
              : 'Approved governance actions will land here once they clear review.',
      };
    case 'rejected':
      return {
        title: 'No rejected proposals',
        detail: `Rejected ${scopeLabel} proposals will stay visible here when they occur.`,
      };
    case 'removed':
      return {
        title: 'No removed proposals',
        detail:
          'Exceptional removals will show up here if Guardians take that action.',
      };
    case 'expired':
      return {
        title: 'No expired proposals',
        detail:
          'Proposals that time out without final resolution will appear here.',
      };
    case 'failed':
      return {
        title: 'No failed executions',
        detail:
          'Any proposal that passes but still needs execution retry will show here.',
      };
    case 'moved':
      return {
        title: 'No moved proposals',
        detail:
          'If a proposal shifts into another governance path, it will appear here.',
      };
    default:
      return {
        title:
          lane === 'protocol'
            ? 'No protocol proposals match these filters'
            : lane === 'partners'
              ? 'No partner proposals match these filters'
              : 'No governance proposals match these filters',
        detail:
          lane === 'protocol'
            ? 'Try clearing a filter or searching for a different contract, method, or proposer.'
            : lane === 'partners'
              ? 'Try clearing a filter or searching for a different community, wallet, or proposal.'
              : 'Try clearing a filter or searching for a different proposal, contract, or wallet.',
      };
  }
}

function parseTimestampToMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  // Nanosecond string (pure digits, 16+ chars) — convert to milliseconds
  if (/^\d{16,}$/.test(value)) {
    try {
      const ms = Number(BigInt(value) / 1_000_000n);
      return Number.isFinite(ms) ? ms : 0;
    } catch {
      return 0;
    }
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getGovernanceStatus(
  app: Application,
  nowMs: number,
  proposalPeriodNs: string | null
): GovernanceFeedItem['status'] {
  const proposalStatus = app.governance_proposal?.status?.toLowerCase();

  switch (proposalStatus) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'removed':
      return 'removed';
    case 'expired':
      return 'expired';
    case 'failed':
      return 'failed';
    case 'moved':
      return 'moved';
    case 'inprogress':
    case 'submitted': {
      if (proposalPeriodNs && app.governance_proposal?.submitted_at) {
        const submittedMs = parseTimestampToMs(
          app.governance_proposal.submitted_at
        );
        const periodMs = Number(proposalPeriodNs) / 1_000_000;
        if (
          submittedMs > 0 &&
          Number.isFinite(periodMs) &&
          submittedMs + periodMs < nowMs
        ) {
          return 'expired';
        }
      }
      return 'open';
    }
    default:
      break;
  }

  switch (app.status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'proposal_submitted':
    case 'ready_for_governance':
    case 'pending':
    case 'reopened':
      return 'open';
  }
}

function getGovernanceStatusLabel(
  status: GovernanceFeedItem['status']
): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'removed':
      return 'Removed';
    case 'expired':
      return 'Expired';
    case 'failed':
      return 'Failed';
    case 'moved':
      return 'Moved';
  }
}

function buildGovernanceFeedItem(
  app: Application,
  nowMs: number,
  proposalPeriodNs: string | null
): GovernanceFeedItem {
  const status = getGovernanceStatus(app, nowMs, proposalPeriodNs);
  const createdAtMs = parseTimestampToMs(app.created_at);
  const reviewedAtMs = parseTimestampToMs(app.reviewed_at);
  const submittedAtMs = parseTimestampToMs(
    app.governance_proposal?.submitted_at
  );
  const activityAtMs = Math.max(createdAtMs, reviewedAtMs, submittedAtMs);
  const lane = app.governance_scope === 'protocol' ? 'protocol' : 'partners';
  const type = lane === 'protocol' ? 'protocol' : 'new_partner';

  return {
    app,
    lane,
    type,
    status,
    statusLabel: getGovernanceStatusLabel(status),
    createdAtMs,
    activityAtMs,
    searchText: [
      app.label,
      app.app_id,
      app.wallet_id,
      app.description,
      app.telegram_handle,
      app.x_handle,
      app.protocol_kind,
      app.protocol_subject,
      app.protocol_target_account,
      app.protocol_target_method,
      app.governance_proposal?.proposal_id,
      app.governance_proposal?.proposer,
      app.governance_proposal?.dao_account,
      lane,
      type === 'protocol' ? 'protocol proposal' : 'new partner',
    ]
      .filter(
        (value): value is string | number =>
          value !== null && value !== undefined
      )
      .join(' ')
      .toLowerCase(),
  };
}
