import type {
  ProtocolApplication,
  ProtocolDaoAction,
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
  ProtocolDaoProposalStatus,
  ProtocolDaoRole,
  ProtocolDaoVote,
  ProtocolDaoVotePolicy,
} from '@/features/protocol/types';

const KIND_BADGES: Record<string, string> = {
  FunctionCall: 'Call',
  Transfer: 'Transfer',
  AddMemberToRole: 'Join',
  RemoveMemberFromRole: 'Leave',
  ChangePolicy: 'Policy',
  ChangePolicyAddOrUpdateRole: 'Role',
  ChangePolicyRemoveRole: 'Role',
  ChangePolicyUpdateDefaultVotePolicy: 'Policy',
  ChangePolicyUpdateParameters: 'Policy',
  ChangeConfig: 'Config',
  SetStakingContract: 'Staking',
  Vote: 'Signal',
};

function normalizeAccount(accountId: string | null | undefined): string {
  return accountId?.trim().toLowerCase() ?? '';
}

function parseNanosecondsToMilliseconds(
  raw: string | null | undefined
): number | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) {
    const asBig = BigInt(value);
    // ns → ms when clearly nanoseconds; otherwise treat as ms.
    if (asBig > 1_000_000_000_000_000n) {
      return Number(asBig / 1_000_000n);
    }
    if (asBig > 1_000_000_000_000n) {
      return Number(asBig);
    }
    return Number(asBig);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRelativeFromDelta(deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  const sec = Math.floor(abs / 1000);
  if (sec < 60) return deltaMs >= 0 ? 'in moments' : 'just now';
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    return deltaMs >= 0 ? `in ${m}m` : `${m}m ago`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    return deltaMs >= 0 ? `in ${h}h` : `${h}h ago`;
  }
  const d = Math.floor(sec / 86400);
  return deltaMs >= 0 ? `in ${d}d` : `${d}d ago`;
}

function formatRelativeTimestamp(
  ms: number,
  nowMs = Date.now()
): {
  relative: string;
  absolute: string;
} {
  return {
    relative: formatRelativeFromDelta(ms - nowMs),
    absolute: new Date(ms).toLocaleString(),
  };
}

export function sumVoteCounts(
  voteCounts: Record<string, [string, string, string]> | null | undefined,
  index: 0 | 1 | 2
): number {
  if (!voteCounts) return 0;
  let total = 0;
  for (const counts of Object.values(voteCounts)) {
    const n = Number.parseInt(String(counts?.[index] ?? '0'), 10);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

export function resolveLiveProposal(
  application: ProtocolApplication
): ProtocolDaoProposal | null {
  const snap = application.governance_proposal?.snapshot ?? null;
  if (snap && typeof snap === 'object') return snap;
  const gp = application.governance_proposal;
  if (gp?.proposal_id == null) return null;
  const kind =
    (gp.kind && typeof gp.kind === 'object' ? gp.kind : null) ??
    ({} as Record<string, unknown>);
  return {
    id: gp.proposal_id ?? undefined,
    proposer: gp.proposer?.trim() || 'unknown',
    description: gp.description?.trim() || application.description || '',
    kind,
    status: (gp.status as ProtocolDaoProposalStatus) || 'InProgress',
    vote_counts: {},
    votes: {},
    submission_time: gp.submitted_at ?? application.created_at,
  };
}

export function proposalKindKey(
  proposal: ProtocolDaoProposal | null
): string {
  if (!proposal?.kind || typeof proposal.kind !== 'object') return 'Proposal';
  return Object.keys(proposal.kind)[0] || 'Proposal';
}

export function proposalActionBadge(
  proposal: ProtocolDaoProposal | null,
  protocolKind?: string | null
): string {
  if (protocolKind?.trim().toLowerCase() === 'signaling') return 'Signal';
  const key = proposalKindKey(proposal);
  return KIND_BADGES[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function proposalHeadline(application: ProtocolApplication): string {
  const subject = application.protocol_subject?.trim();
  if (subject) return subject;
  const label = application.label?.trim();
  if (label) return label;
  const description =
    application.governance_proposal?.description?.trim() ||
    application.description?.trim();
  if (description) {
    return description.length > 96
      ? `${description.slice(0, 93).trimEnd()}…`
      : description;
  }
  const id = application.governance_proposal?.proposal_id;
  return id != null ? `Proposal #${id}` : 'Proposal';
}

export function proposalDescription(
  application: ProtocolApplication,
  proposal: ProtocolDaoProposal | null
): string {
  return (
    proposal?.description?.trim() ||
    application.governance_proposal?.description?.trim() ||
    application.description?.trim() ||
    ''
  );
}

export function statusLabel(
  status: ProtocolDaoProposalStatus | null | undefined
): string {
  switch (status) {
    case 'InProgress':
      return 'In review';
    case 'Approved':
      return 'Approved';
    case 'Rejected':
      return 'Rejected';
    case 'Removed':
      return 'Removed';
    case 'Expired':
      return 'Expired';
    case 'Failed':
      return 'Retry';
    case 'Moved':
      return 'Moved';
    default:
      return 'Proposal';
  }
}

export type ProtocolStatusTone =
  | 'review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'neutral';

export function statusTone(
  status: ProtocolDaoProposalStatus | null | undefined,
  expired = false
): ProtocolStatusTone {
  const effective =
    expired && status === 'InProgress' ? 'Expired' : (status ?? null);
  switch (effective) {
    case 'Approved':
      return 'approved';
    case 'Rejected':
    case 'Removed':
      return 'rejected';
    case 'Expired':
    case 'Failed':
      return 'expired';
    case 'InProgress':
      return 'review';
    default:
      return 'neutral';
  }
}

function getGroupMembers(role: ProtocolDaoRole): string[] {
  return (role.kind?.Group ?? []).map((id) => normalizeAccount(id));
}

function findViewerRole(
  policy: ProtocolDaoPolicy | null,
  accountId: string | null | undefined
): ProtocolDaoRole | null {
  const viewer = normalizeAccount(accountId);
  if (!viewer || !policy?.roles?.length) return null;
  return (
    policy.roles.find((role) => getGroupMembers(role).includes(viewer)) ?? null
  );
}

function findVotingRole(
  policy: ProtocolDaoPolicy | null,
  viewerRole: ProtocolDaoRole | null
): ProtocolDaoRole | null {
  if (viewerRole) return viewerRole;
  return (
    policy?.roles?.find((role) => getGroupMembers(role).length > 0) ?? null
  );
}

function roleAllowsAction(
  role: ProtocolDaoRole,
  action: ProtocolDaoAction
): boolean {
  const permissions = role.permissions ?? [];
  if (permissions.includes('*:*') || permissions.includes(`*:${action}`)) {
    return true;
  }
  return permissions.some(
    (entry) =>
      entry === action ||
      entry.endsWith(`:${action}`) ||
      entry === `*:${action}`
  );
}

function resolveVotePolicy(
  role: ProtocolDaoRole | null,
  policy: ProtocolDaoPolicy | null
): ProtocolDaoVotePolicy | null {
  if (role?.vote_policy) {
    const values = Object.values(role.vote_policy);
    if (values[0]) return values[0]!;
  }
  return policy?.default_vote_policy ?? null;
}

function toThresholdWeight(
  threshold: ProtocolDaoVotePolicy['threshold'],
  pool: number
): number {
  if (typeof threshold === 'string') {
    const n = Number.parseInt(threshold, 10);
    return Number.isFinite(n) ? n : 0;
  }
  if (!Array.isArray(threshold) || threshold.length < 2) return 0;
  const [num, den] = threshold;
  if (!den || den <= 0) return 0;
  return Math.ceil((pool * num) / den);
}

export function deriveProtocolProposalView(opts: {
  application: ProtocolApplication;
  accountId: string | null | undefined;
  daoPolicy: ProtocolDaoPolicy | null;
  nowMs?: number;
}): {
  proposal: ProtocolDaoProposal | null;
  proposalId: number | null;
  headline: string;
  description: string;
  actionBadge: string;
  status: ProtocolDaoProposalStatus | null;
  statusLabel: string;
  statusTone: ProtocolStatusTone;
  targetAccount: string | null;
  targetMethod: string | null;
  proposer: string | null;
  submission: { relative: string; absolute: string } | null;
  deadline: {
    relative: string;
    absolute: string;
    expired: boolean;
    prefix: string;
  } | null;
  currentVote: ProtocolDaoVote | null;
  canApprove: boolean;
  canReject: boolean;
  canFinalize: boolean;
  finalizeLabel: string;
  approveVotes: number;
  rejectVotes: number;
  removeVotes: number;
  voteEntries: Array<[string, ProtocolDaoVote]>;
  eligibleVoters: string[];
  votingProgress: {
    threshold: number | null;
    totalWeight: number | null;
    approvals: number;
    rejects: number;
    removes: number;
  };
  roleName: string | null;
} {
  const { application, accountId, daoPolicy } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const proposal = resolveLiveProposal(application);
  const proposalId =
    proposal?.id ?? application.governance_proposal?.proposal_id ?? null;
  const viewerRole = findViewerRole(daoPolicy, accountId);
  const votingRole = findVotingRole(daoPolicy, viewerRole);
  const viewer = normalizeAccount(accountId);
  const currentVote =
    viewer && proposal?.votes
      ? (Object.entries(proposal.votes).find(
          ([id]) => normalizeAccount(id) === viewer
        )?.[1] ?? null)
      : null;

  const submissionMs = proposal
    ? parseNanosecondsToMilliseconds(proposal.submission_time)
    : null;
  const periodMs = parseNanosecondsToMilliseconds(daoPolicy?.proposal_period);
  const expiresAtMs =
    submissionMs != null && periodMs != null ? submissionMs + periodMs : null;
  const expired =
    proposal?.status === 'Expired' ||
    proposal?.status === 'Failed' ||
    (proposal?.status === 'InProgress' &&
      expiresAtMs != null &&
      expiresAtMs <= nowMs);

  let deadline: {
    relative: string;
    absolute: string;
    expired: boolean;
    prefix: string;
  } | null = null;
  if (
    expiresAtMs != null &&
    proposal &&
    (proposal.status === 'InProgress' ||
      proposal.status === 'Expired' ||
      proposal.status === 'Failed')
  ) {
    const delta = expiresAtMs - nowMs;
    deadline = {
      relative: formatRelativeFromDelta(delta),
      absolute: new Date(expiresAtMs).toLocaleString(),
      expired,
      prefix: expired ? 'Closed' : 'Closes',
    };
  }

  const status = proposal?.status ?? null;
  const effectiveStatus =
    expired && status === 'InProgress' ? 'Expired' : status;
  const inProgress = status === 'InProgress' && !expired;
  const canApprove =
    !!viewerRole &&
    !!proposal &&
    inProgress &&
    !currentVote &&
    roleAllowsAction(viewerRole, 'VoteApprove');
  const canReject =
    !!viewerRole &&
    !!proposal &&
    inProgress &&
    !currentVote &&
    roleAllowsAction(viewerRole, 'VoteReject');
  const canFinalize =
    !!viewerRole &&
    !!proposal &&
    (effectiveStatus === 'Expired' || effectiveStatus === 'Failed') &&
    roleAllowsAction(viewerRole, 'Finalize');

  const approveVotes = sumVoteCounts(proposal?.vote_counts, 0);
  const rejectVotes = sumVoteCounts(proposal?.vote_counts, 1);
  const removeVotes = sumVoteCounts(proposal?.vote_counts, 2);
  const pool = votingRole ? getGroupMembers(votingRole).length : 0;
  const votePolicy = resolveVotePolicy(votingRole, daoPolicy);
  const threshold =
    votePolicy && pool > 0
      ? Math.max(
          Number.parseInt(votePolicy.quorum ?? '0', 10) || 0,
          toThresholdWeight(votePolicy.threshold, pool)
        )
      : null;

  const voteEntries = Object.entries(proposal?.votes ?? {}).sort(
    ([left], [right]) => {
      if (viewer && normalizeAccount(left) === viewer) return -1;
      if (viewer && normalizeAccount(right) === viewer) return 1;
      return left.localeCompare(right);
    }
  ) as Array<[string, ProtocolDaoVote]>;

  const eligibleVoters = votingRole ? getGroupMembers(votingRole) : [];

  return {
    proposal,
    proposalId,
    headline: proposalHeadline(application),
    description: proposalDescription(application, proposal),
    actionBadge: proposalActionBadge(proposal, application.protocol_kind),
    status,
    statusLabel: statusLabel(effectiveStatus),
    statusTone: statusTone(status, expired),
    targetAccount: application.protocol_target_account?.trim() || null,
    targetMethod: application.protocol_target_method?.trim() || null,
    proposer: proposal?.proposer?.trim() || null,
    submission:
      submissionMs != null
        ? formatRelativeTimestamp(submissionMs, nowMs)
        : null,
    deadline,
    currentVote,
    canApprove,
    canReject,
    canFinalize,
    finalizeLabel: effectiveStatus === 'Failed' ? 'Retry' : 'Finalize',
    approveVotes,
    rejectVotes,
    removeVotes,
    voteEntries,
    eligibleVoters,
    votingProgress: {
      threshold,
      totalWeight: pool > 0 ? pool : null,
      approvals: approveVotes,
      rejects: rejectVotes,
      removes: removeVotes,
    },
    roleName: viewerRole?.name?.trim() || votingRole?.name?.trim() || null,
  };
}

export function actionLabel(action: ProtocolDaoAction): string {
  switch (action) {
    case 'VoteApprove':
      return 'approval vote';
    case 'VoteReject':
      return 'rejection vote';
    case 'VoteRemove':
      return 'remove vote';
    case 'Finalize':
      return 'finalize';
    default:
      return 'governance action';
  }
}

export function applyOptimisticVote(
  proposal: ProtocolDaoProposal,
  accountId: string,
  vote: ProtocolDaoVote,
  roleName = 'council'
): ProtocolDaoProposal {
  const vote_counts = { ...proposal.vote_counts };
  const existing = vote_counts[roleName] ?? (['0', '0', '0'] as [
    string,
    string,
    string,
  ]);
  const next: [string, string, string] = [
    String(Number.parseInt(existing[0], 10) || 0),
    String(Number.parseInt(existing[1], 10) || 0),
    String(Number.parseInt(existing[2], 10) || 0),
  ];
  const idx = vote === 'Approve' ? 0 : vote === 'Reject' ? 1 : 2;
  next[idx] = String((Number.parseInt(next[idx], 10) || 0) + 1);
  vote_counts[roleName] = next;
  return {
    ...proposal,
    votes: {
      ...proposal.votes,
      [accountId]: vote,
    },
    vote_counts,
  };
}

