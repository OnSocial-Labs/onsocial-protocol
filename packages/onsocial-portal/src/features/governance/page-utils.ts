import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
import type {
  Application,
  GovernanceDaoProposal,
  GovernanceScope,
  ProtocolGovernanceKind,
} from '@/features/governance/types';

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

export function parseGovernanceProposalId(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

/** Resolve proposal id from the query string or synthetic feed app ids. */
export function resolveGovernanceProposalId(
  appId: string,
  proposalIdFromQuery: number | null
): number | null {
  if (proposalIdFromQuery != null) return proposalIdFromQuery;

  const syntheticMatch = appId.match(/^(?:protocol|partner)-proposal-(\d+)$/);
  if (!syntheticMatch) return null;

  const parsed = Number(syntheticMatch[1]);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function resolveGovernanceScopeFromAppId(appId: string): GovernanceScope {
  if (appId.startsWith('protocol-proposal-')) return 'protocol';
  return 'partners';
}

function mapDaoProposalStatusToApplicationStatus(
  status: GovernanceDaoProposal['status']
): Application['status'] {
  if (status === 'Approved') return 'approved';
  if (status === 'Rejected' || status === 'Removed') return 'rejected';
  return 'proposal_submitted';
}

export type GovernanceApplicationBootstrapOptions = {
  scope?: GovernanceScope;
  label?: string;
  protocolKind?: ProtocolGovernanceKind | null;
  protocolSubject?: string | null;
  protocolTargetAccount?: string | null;
  protocolTargetMethod?: string | null;
};

/** Minimal feed row for rendering a card before the full governance feed returns. */
export function buildGovernanceApplicationFromDaoProposal(
  appId: string,
  liveProposal: GovernanceDaoProposal,
  proposalId: number,
  options?: GovernanceApplicationBootstrapOptions
): Application {
  const scope = options?.scope ?? resolveGovernanceScopeFromAppId(appId);
  const description = liveProposal.description?.trim() || null;
  const normalizedProposal: GovernanceDaoProposal = {
    ...liveProposal,
    id: liveProposal.id ?? proposalId,
  };

  return {
    app_id: appId,
    label: options?.label ?? description?.split('\n')[0]?.trim() ?? appId,
    status: mapDaoProposalStatusToApplicationStatus(normalizedProposal.status),
    wallet_id: null,
    description,
    website_url: null,
    telegram_handle: null,
    x_handle: null,
    admin_notes: null,
    created_at: '',
    reviewed_at: null,
    governance_scope: scope,
    protocol_kind: options?.protocolKind ?? null,
    protocol_subject: options?.protocolSubject ?? null,
    protocol_target_account: options?.protocolTargetAccount ?? null,
    protocol_target_method: options?.protocolTargetMethod ?? null,
    governance_proposal: {
      proposal_id: proposalId,
      status: normalizedProposal.status,
      proposer: liveProposal.proposer,
      description,
      dao_account: GOVERNANCE_DAO_ACCOUNT,
      tx_hash: null,
      submitted_at: null,
      kind: liveProposal.kind,
      snapshot: normalizedProposal,
    },
  };
}

/** Keep the fast bootstrap snapshot when the slower feed row omits it. */
export function mergeGovernanceFeedApplication(
  bootstrap: Application,
  feedApp: Application | null
): Application {
  if (!feedApp) return bootstrap;

  const feedSnapshot = feedApp.governance_proposal?.snapshot;
  const bootstrapSnapshot = bootstrap.governance_proposal?.snapshot;

  const mergedSnapshot = feedSnapshot ?? bootstrapSnapshot ?? null;

  return {
    ...feedApp,
    governance_proposal: feedApp.governance_proposal
      ? {
          ...feedApp.governance_proposal,
          snapshot: mergedSnapshot
            ? {
                ...mergedSnapshot,
                policy_snapshot:
                  feedSnapshot?.policy_snapshot ??
                  bootstrapSnapshot?.policy_snapshot ??
                  mergedSnapshot.policy_snapshot,
              }
            : null,
        }
      : bootstrap.governance_proposal,
  };
}

/** Apply a fresh DAO snapshot onto every feed row for the same proposal id. */
export function patchGovernanceFeedApplicationSnapshot(
  apps: Application[],
  proposalId: number,
  snapshot: GovernanceDaoProposal
): Application[] {
  return apps.map((app) => {
    if (app.governance_proposal?.proposal_id !== proposalId) {
      return app;
    }

    if (!app.governance_proposal) {
      return app;
    }

    return {
      ...app,
      governance_proposal: {
        ...app.governance_proposal,
        status: snapshot.status,
        snapshot,
      },
    };
  });
}

/** Merge a fast bootstrap list into the slower backend feed without losing snapshots. */
export function mergeGovernanceFeedApplications(
  bootstrapApps: Application[],
  feedApps: Application[]
): Application[] {
  if (feedApps.length === 0) {
    return bootstrapApps;
  }

  const bootstrapByProposalId = new Map(
    bootstrapApps
      .filter((app) => app.governance_proposal?.proposal_id != null)
      .map((app) => [app.governance_proposal!.proposal_id as number, app])
  );

  return feedApps.map((feedApp) => {
    const proposalId = feedApp.governance_proposal?.proposal_id;
    if (proposalId == null) {
      return feedApp;
    }

    const bootstrap = bootstrapByProposalId.get(proposalId);
    return bootstrap
      ? mergeGovernanceFeedApplication(bootstrap, feedApp)
      : feedApp;
  });
}

export function buildGovernanceProposalPath(
  appId: string,
  proposalId?: number | null
): string {
  const base = `/governance/${encodeURIComponent(appId)}`;
  if (proposalId == null) return base;
  return `${base}?proposal=${proposalId}`;
}

/** Pick the feed row that matches a proposal when app_id appears more than once. */
export function resolveGovernanceApplication(
  apps: Application[],
  appId: string,
  proposalId?: number | null
): Application | null {
  const matches = apps.filter((application) => application.app_id === appId);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  if (proposalId != null) {
    const matchedProposal = matches.find(
      (application) =>
        application.governance_proposal?.proposal_id === proposalId
    );
    if (matchedProposal) return matchedProposal;
  }

  return (
    matches.find(
      (application) => application.governance_proposal?.proposal_id != null
    ) ?? matches[0]
  );
}
