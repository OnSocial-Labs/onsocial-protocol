import type {
  ProtocolApplication,
  ProtocolDaoAction,
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
  ProtocolDaoProposalStatus,
  ProtocolDaoRole,
  ProtocolDaoVote,
} from '@/features/protocol/types';

function normalizeAccount(accountId: string | null | undefined): string {
  return accountId?.trim().toLowerCase() ?? '';
}

export function sumVoteCounts(
  voteCounts: Record<string, [string, string, string]> | null | undefined,
  index: 0 | 1 | 2
): number {
  if (!voteCounts) return 0;
  let total = 0;
  for (const counts of Object.values(voteCounts)) {
    const raw = counts?.[index];
    const n = Number.parseInt(String(raw ?? '0'), 10);
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
  if (!gp?.proposal_id && gp?.proposal_id !== 0) return null;
  const kind =
    (gp.kind && typeof gp.kind === 'object' ? gp.kind : null) ??
    ({} as Record<string, unknown>);
  const status = (gp.status as ProtocolDaoProposalStatus) || 'InProgress';
  return {
    id: gp.proposal_id ?? undefined,
    proposer: gp.proposer?.trim() || 'unknown',
    description: gp.description?.trim() || application.description || '',
    kind,
    status,
    vote_counts: {},
    votes: {},
    submission_time: gp.submitted_at ?? application.created_at,
  };
}

export function proposalKindKey(
  proposal: ProtocolDaoProposal | null
): string {
  if (!proposal?.kind || typeof proposal.kind !== 'object') return 'Proposal';
  const key = Object.keys(proposal.kind)[0];
  return key || 'Proposal';
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
    return description.length > 72
      ? `${description.slice(0, 69).trimEnd()}…`
      : description;
  }
  const id = application.governance_proposal?.proposal_id;
  return id != null ? `Proposal #${id}` : 'Proposal';
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
      return 'Failed';
    case 'Moved':
      return 'Moved';
    default:
      return 'Proposal';
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

export function deriveProtocolProposalActions(opts: {
  accountId: string | null | undefined;
  daoPolicy: ProtocolDaoPolicy | null;
  proposal: ProtocolDaoProposal | null;
}): {
  currentVote: ProtocolDaoVote | null;
  canApprove: boolean;
  canReject: boolean;
  canFinalize: boolean;
  finalizeLabel: string;
  approveVotes: number;
  rejectVotes: number;
  removeVotes: number;
} {
  const { accountId, daoPolicy, proposal } = opts;
  const role = findViewerRole(daoPolicy, accountId);
  const viewer = normalizeAccount(accountId);
  const currentVote =
    viewer && proposal?.votes
      ? (Object.entries(proposal.votes).find(
          ([id]) => normalizeAccount(id) === viewer
        )?.[1] ?? null)
      : null;
  const status = proposal?.status ?? null;
  const inProgress = status === 'InProgress';
  const canApprove =
    !!role &&
    !!proposal &&
    inProgress &&
    !currentVote &&
    roleAllowsAction(role, 'VoteApprove');
  const canReject =
    !!role &&
    !!proposal &&
    inProgress &&
    !currentVote &&
    roleAllowsAction(role, 'VoteReject');
  const canFinalize =
    !!role &&
    !!proposal &&
    (status === 'Expired' ||
      status === 'Failed' ||
      status === 'Approved' ||
      status === 'Rejected') &&
    roleAllowsAction(role, 'Finalize') &&
    (status === 'Expired' || status === 'Failed');
  return {
    currentVote,
    canApprove,
    canReject,
    canFinalize,
    finalizeLabel: status === 'Failed' ? 'Retry' : 'Finalize',
    approveVotes: sumVoteCounts(proposal?.vote_counts, 0),
    rejectVotes: sumVoteCounts(proposal?.vote_counts, 1),
    removeVotes: sumVoteCounts(proposal?.vote_counts, 2),
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
