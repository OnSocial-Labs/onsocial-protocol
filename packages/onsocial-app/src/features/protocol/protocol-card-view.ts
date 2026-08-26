import { daoRoleGroupMembers } from '@/features/protocol/protocol-propose-gate';
import { getProtocolProposalPolicyLabel } from '@/features/protocol/protocol-proposal-presentation';
import { deriveProtocolProposalPresentation } from '@/features/protocol/protocol-proposal-presentation';
import { proposalPeriodNsToDays } from '@/features/protocol/protocol-policy';
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
  Removed: 'Removed',
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

function normalizeVoteCountToken(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'bigint') return value.toString();
  return String(value).trim();
}

function isLikelyRoleWeightVoteCount(value: unknown): boolean {
  const raw = normalizeVoteCountToken(value);
  if (!raw || !/^\d+$/.test(raw)) return false;
  // Head-count tallies stay small; token-weight buckets use yocto-scale strings.
  return raw.length <= 4;
}

function readRoleWeightVoteCount(
  voteCounts: Record<string, [string, string, string]> | null | undefined,
  roleName: string | null | undefined,
  index: 0 | 1 | 2
): number | null {
  const normalizedRole = roleName?.trim();
  if (!normalizedRole || !voteCounts?.[normalizedRole]) return null;
  const value = voteCounts[normalizedRole][index];
  if (!isLikelyRoleWeightVoteCount(value)) return null;
  return Number.parseInt(normalizeVoteCountToken(value), 10);
}

function countVotesFromProposalMap(
  votes: Record<string, ProtocolDaoVote> | undefined
): { approvals: number; rejects: number; removes: number } {
  let approvals = 0;
  let rejects = 0;
  let removes = 0;
  for (const vote of Object.values(votes ?? {})) {
    if (vote === 'Approve') approvals += 1;
    else if (vote === 'Reject') rejects += 1;
    else if (vote === 'Remove') removes += 1;
  }
  return { approvals, rejects, removes };
}

function readLegacyRoleWeightVoteTallies(
  voteCounts: Record<string, [string, string, string]> | null | undefined
): { approvals: number; rejects: number; removes: number } | null {
  if (!voteCounts) return null;
  for (const [roleName, counts] of Object.entries(voteCounts)) {
    if (roleName === 'all') continue;
    const approvals = isLikelyRoleWeightVoteCount(counts[0])
      ? Number.parseInt(normalizeVoteCountToken(counts[0]), 10)
      : 0;
    const rejects = isLikelyRoleWeightVoteCount(counts[1])
      ? Number.parseInt(normalizeVoteCountToken(counts[1]), 10)
      : 0;
    const removes = isLikelyRoleWeightVoteCount(counts[2])
      ? Number.parseInt(normalizeVoteCountToken(counts[2]), 10)
      : 0;
    if (approvals + rejects + removes > 0) {
      return { approvals, rejects, removes };
    }
  }
  return null;
}

export function resolveProtocolProposalVoteTallies(
  proposal: ProtocolDaoProposal | null | undefined,
  votingRole: ProtocolDaoRole | null,
  votePolicy: ProtocolDaoVotePolicy | null
): { approvals: number; rejects: number; removes: number } {
  if (!proposal) return { approvals: 0, rejects: 0, removes: 0 };

  const weightKind = votePolicy?.weight_kind ?? 'RoleWeight';
  if (weightKind !== 'RoleWeight') {
    return {
      approvals: sumVoteCounts(proposal.vote_counts, 0),
      rejects: sumVoteCounts(proposal.vote_counts, 1),
      removes: sumVoteCounts(proposal.vote_counts, 2),
    };
  }

  const roleApprovals = readRoleWeightVoteCount(
    proposal.vote_counts,
    votingRole?.name,
    0
  );
  if (roleApprovals != null) {
    return {
      approvals: roleApprovals,
      rejects:
        readRoleWeightVoteCount(proposal.vote_counts, votingRole?.name, 1) ??
        0,
      removes:
        readRoleWeightVoteCount(proposal.vote_counts, votingRole?.name, 2) ??
        0,
    };
  }

  const legacyTallies = readLegacyRoleWeightVoteTallies(proposal.vote_counts);
  if (legacyTallies) return legacyTallies;

  return countVotesFromProposalMap(proposal.votes);
}

/** DAO policy period, falling back to the proposal's submission-time snapshot. */
export function resolveProposalPeriodMs(
  proposal: ProtocolDaoProposal | null,
  daoPolicy: ProtocolDaoPolicy | null
): number | null {
  const periodNs =
    daoPolicy?.proposal_period?.trim() ||
    proposal?.policy_snapshot?.proposal_period?.trim() ||
    null;
  const days = proposalPeriodNsToDays(periodNs);
  if (!days) return null;
  const dayCount = Number(days);
  if (!Number.isFinite(dayCount) || dayCount <= 0) return null;
  return dayCount * 86_400_000;
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

export function proposalKindKey(proposal: ProtocolDaoProposal | null): string {
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
  return daoRoleGroupMembers(role).map((id) => normalizeAccount(id));
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

function resolveEffectiveDaoPolicy(
  proposal: ProtocolDaoProposal | null,
  daoPolicy: ProtocolDaoPolicy | null
): ProtocolDaoPolicy | null {
  return daoPolicy ?? proposal?.policy_snapshot ?? null;
}

function hasFrozenProposalPolicySnapshot(
  proposal: ProtocolDaoProposal | null
): boolean {
  return Boolean(proposal?.policy_snapshot);
}

function findProtocolRoleByName(
  policy: ProtocolDaoPolicy | null,
  roleId: string | null | undefined
): ProtocolDaoRole | null {
  const normalized = roleId?.trim().toLowerCase();
  if (!normalized || !policy?.roles?.length) return null;
  return (
    policy.roles.find(
      (role) => role.name?.trim().toLowerCase() === normalized
    ) ?? null
  );
}

function getProposalPolicyLabel(
  proposal: ProtocolDaoProposal | null
): string {
  return getProtocolProposalPolicyLabel(proposal?.kind ?? null);
}

function getRoleSize(role: ProtocolDaoRole): number | null {
  const members = getGroupMembers(role);
  return members.length > 0 ? members.length : null;
}

type MembershipProposalInfo = {
  kind: 'add' | 'remove';
  memberId: string;
  roleId: string | null;
};

function readMembershipProposalMemberId(
  proposal: ProtocolDaoProposal | null
): MembershipProposalInfo | null {
  if (!proposal?.kind || typeof proposal.kind !== 'object') return null;
  const kindKey = Object.keys(proposal.kind)[0];
  if (kindKey !== 'AddMemberToRole' && kindKey !== 'RemoveMemberFromRole') {
    return null;
  }
  const payload = proposal.kind[kindKey];
  if (!payload || typeof payload !== 'object') return null;
  const memberId =
    'member_id' in payload && typeof payload.member_id === 'string'
      ? normalizeAccount(payload.member_id)
      : null;
  const roleId =
    'role' in payload && typeof payload.role === 'string'
      ? payload.role.trim()
      : null;
  if (!memberId) return null;
  return {
    kind: kindKey === 'AddMemberToRole' ? 'add' : 'remove',
    memberId,
    roleId,
  };
}

function getProposalVotingRole(
  proposal: ProtocolDaoProposal | null,
  policy: ProtocolDaoPolicy | null,
  viewerRole: ProtocolDaoRole | null,
  proposalPolicyLabel: string,
  votingClosed = false
): ProtocolDaoRole | null {
  const membership = readMembershipProposalMemberId(proposal);
  if (membership?.roleId) {
    const targetRole = findProtocolRoleByName(policy, membership.roleId);
    if (targetRole) return targetRole;
  }

  const preferVoteTimePolicyRole =
    votingClosed && hasFrozenProposalPolicySnapshot(proposal);

  return (
    (preferVoteTimePolicyRole ? null : viewerRole) ??
    policy?.roles?.find((role) =>
      roleAllowsAction(role, proposalPolicyLabel, 'VoteApprove')
    ) ??
    null
  );
}

function getVotingPoolSize(
  role: ProtocolDaoRole,
  proposal: ProtocolDaoProposal | null,
  votingClosed = false
): number | null {
  const baseSize = getRoleSize(role);
  if (baseSize === null) return null;

  const membership = readMembershipProposalMemberId(proposal);
  if (membership) {
    const members = getGroupMembers(role);
    const subjectInGroup = members.includes(membership.memberId);
    const votesCast = Object.keys(proposal?.votes ?? {}).length;

    if (membership.kind === 'add') {
      if (subjectInGroup && votingClosed && proposal?.status === 'Approved') {
        return Math.max(baseSize - 1, 0);
      }
      const voteTimePool = members.filter(
        (member) => member !== membership.memberId
      ).length;
      return voteTimePool > 0 ? voteTimePool : baseSize;
    }

    if (membership.kind === 'remove') {
      if (subjectInGroup) return baseSize;
      if (votingClosed && proposal?.status === 'Approved') {
        return baseSize <= votesCast ? baseSize + 1 : baseSize;
      }
      return baseSize + 1;
    }
  }

  if (
    hasFrozenProposalPolicySnapshot(proposal) &&
    votingClosed &&
    proposal &&
    isTerminalProtocolProposalStatus(proposal.status)
  ) {
    return baseSize;
  }

  return baseSize;
}

function getEligibleVotersForProposal(
  role: ProtocolDaoRole | null,
  proposal: ProtocolDaoProposal | null,
  votingClosed = false
): string[] {
  const membership = readMembershipProposalMemberId(proposal);
  const terminal =
    proposal &&
    (isTerminalProtocolProposalStatus(proposal.status) || votingClosed);

  if (terminal && membership && role) {
    const members = getGroupMembers(role);
    if (membership.kind === 'add') {
      if (members.includes(membership.memberId)) {
        return members.filter((member) => member !== membership.memberId);
      }
      return Object.keys(proposal?.votes ?? {})
        .map((account) => normalizeAccount(account))
        .sort((left, right) => left.localeCompare(right));
    }
    if (members.includes(membership.memberId)) {
      return members;
    }
    const poolSize = getVotingPoolSize(role, proposal, true);
    const voters = Object.keys(proposal?.votes ?? {}).map((account) =>
      normalizeAccount(account)
    );
    const voterSet = new Set(voters);
    const candidateUnion = [
      ...new Set([...members, membership.memberId]),
    ];
    if (poolSize != null && candidateUnion.length > poolSize) {
      const eligible = [...voters];
      for (const member of members) {
        if (eligible.length >= poolSize) break;
        if (!voterSet.has(member)) {
          eligible.push(member);
        }
      }
      if (
        eligible.length < poolSize &&
        !eligible.includes(membership.memberId)
      ) {
        eligible.push(membership.memberId);
      }
      return sortEligibleRemoveMembers(eligible, membership.memberId);
    }
    return sortEligibleRemoveMembers(
      [...new Set([...members, membership.memberId])],
      membership.memberId
    );
  }

  if (terminal) {
    return Object.keys(proposal?.votes ?? {})
      .map((account) => normalizeAccount(account))
      .sort((left, right) => left.localeCompare(right));
  }

  if (!role) return [];

  const members = getGroupMembers(role);
  if (!membership) return members;

  if (membership.kind === 'add') {
    return members.filter((member) => member !== membership.memberId);
  }

  if (members.includes(membership.memberId)) {
    return members;
  }

  return [...members, membership.memberId];
}

function sortEligibleRemoveMembers(
  accounts: string[],
  subjectId: string
): string[] {
  const subject = normalizeAccount(subjectId);
  return [...accounts].sort((left, right) => {
    const leftId = normalizeAccount(left);
    const rightId = normalizeAccount(right);
    if (leftId === subject) return 1;
    if (rightId === subject) return -1;
    return leftId.localeCompare(rightId);
  });
}

function findSnapshotVotingRole(
  proposal: ProtocolDaoProposal | null,
  role: ProtocolDaoRole | null
): ProtocolDaoRole | null {
  const roles = proposal?.policy_snapshot?.roles;
  if (!roles?.length) return null;

  const preferredName = role?.name?.trim().toLowerCase();
  if (preferredName) {
    const exact = roles.find(
      (entry) => entry.name?.trim().toLowerCase() === preferredName
    );
    if (exact) return exact;
  }

  for (const legacyName of ['guardians', 'council'] as const) {
    const legacy = roles.find(
      (entry) => entry.name?.trim().toLowerCase() === legacyName
    );
    if (legacy) return legacy;
  }

  return null;
}

function getSnapshotRolePoolSize(
  proposal: ProtocolDaoProposal | null,
  role: ProtocolDaoRole | null,
  membership: MembershipProposalInfo | null
): number | null {
  const snapshotRole = findSnapshotVotingRole(proposal, role);
  if (!snapshotRole) return null;
  const members = getGroupMembers(snapshotRole);
  if (members.length === 0) return null;
  if (membership?.kind === 'add') {
    const voteTimePool = members.filter(
      (member) => member !== membership.memberId
    ).length;
    return voteTimePool > 0 ? voteTimePool : members.length;
  }
  if (membership?.kind === 'remove') {
    if (members.includes(membership.memberId)) return members.length;
    return members.length + 1;
  }
  return members.length;
}

function resolveVoteTimePoolSize(
  role: ProtocolDaoRole,
  proposal: ProtocolDaoProposal,
  currentPoolSize: number,
  votesCast: number,
  votingClosed: boolean
): number {
  const membership = readMembershipProposalMemberId(proposal);
  if (membership?.kind === 'remove') {
    return currentPoolSize;
  }

  const terminal =
    isTerminalProtocolProposalStatus(proposal.status) || votingClosed;
  if (!terminal || votesCast <= 0 || votesCast >= currentPoolSize) {
    return currentPoolSize;
  }

  if (membership?.kind === 'add') {
    const members = getGroupMembers(role);
    const subjectInGroup = members.includes(membership.memberId);
    if (subjectInGroup && proposal.status === 'Approved') {
      return Math.max(members.length - 1, votesCast);
    }
    if (!subjectInGroup) {
      return votesCast;
    }
    return currentPoolSize;
  }

  const snapshotPool = getSnapshotRolePoolSize(proposal, role, membership);
  if (snapshotPool != null && snapshotPool > votesCast) {
    return snapshotPool;
  }

  return votesCast;
}

function toThresholdWeight(
  threshold: ProtocolDaoVotePolicy['threshold'],
  totalWeight: number
): number {
  if (typeof threshold === 'string') {
    const n = Number(threshold);
    return Number.isFinite(n) ? Math.min(n, totalWeight) : 0;
  }
  if (!Array.isArray(threshold) || threshold.length < 2) return 0;
  const [numerator, denominator] = threshold;
  if (!denominator) return totalWeight;
  if (numerator >= denominator) return totalWeight;
  return Math.min(
    Math.floor((numerator * totalWeight) / denominator) + 1,
    totalWeight
  );
}

function getVotingProgress(
  role: ProtocolDaoRole | null,
  policy: ProtocolDaoPolicy | null,
  proposalPolicyLabel: string,
  approvals: number,
  rejects: number,
  removes: number,
  proposal: ProtocolDaoProposal | null,
  votingClosed = false
): {
  threshold: number | null;
  totalWeight: number | null;
  approvals: number;
  rejects: number;
  removes: number;
} {
  if (!role) {
    return {
      threshold: null,
      totalWeight: null,
      approvals,
      rejects,
      removes,
    };
  }

  const votePolicy = resolveVotePolicy(role, policy, proposalPolicyLabel);
  const currentPoolSize = getVotingPoolSize(role, proposal, votingClosed);
  const votesCast = approvals + rejects + removes;
  const voteTimePoolSize =
    proposal && currentPoolSize != null
      ? resolveVoteTimePoolSize(
          role,
          proposal,
          currentPoolSize,
          votesCast,
          votingClosed
        )
      : currentPoolSize;
  const poolForThreshold = voteTimePoolSize;
  const displayTotalWeight = voteTimePoolSize;

  if (
    !votePolicy ||
    votePolicy.weight_kind !== 'RoleWeight' ||
    poolForThreshold === null
  ) {
    return {
      threshold: null,
      totalWeight: displayTotalWeight,
      approvals,
      rejects,
      removes,
    };
  }

  const threshold = Math.max(
    Number.parseInt(votePolicy.quorum ?? '0', 10) || 0,
    toThresholdWeight(votePolicy.threshold, poolForThreshold)
  );

  return {
    threshold,
    totalWeight: displayTotalWeight,
    approvals,
    rejects,
    removes,
  };
}

function roleAllowsAction(
  role: ProtocolDaoRole,
  proposalPolicyLabel: string,
  action: ProtocolDaoAction
): boolean {
  const permissions = role.permissions ?? [];
  return permissions.some(
    (permission) =>
      permission === '*:*' ||
      permission === `*:${action}` ||
      permission === `${proposalPolicyLabel}:${action}`
  );
}

function resolveVotePolicy(
  role: ProtocolDaoRole | null,
  policy: ProtocolDaoPolicy | null,
  proposalPolicyLabel: string
): ProtocolDaoVotePolicy | null {
  if (!role) return null;
  return (
    role.vote_policy?.[proposalPolicyLabel] ??
    policy?.default_vote_policy ??
    null
  );
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
  targetKind: string | null;
  targetValue: string | null;
  subjectAccount: string | null;
  subjectText: string | null;
  subjectEyebrow: string | null;
  showProposerSeparately: boolean;
  showProposerAsSelf: boolean;
  onChainAction: string | null;
  onChainActionKind: 'policy' | 'method' | null;
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
  canRemove: boolean;
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
  const presentation = deriveProtocolProposalPresentation({
    kind: proposal?.kind ?? application.governance_proposal?.kind ?? null,
    description: proposalDescription(application, proposal),
    proposer:
      proposal?.proposer?.trim() ||
      application.governance_proposal?.proposer ||
      null,
    fallbackHeadline: proposalHeadline(application),
    fallbackBadge: proposalActionBadge(proposal, application.protocol_kind),
  });
  const proposalId =
    proposal?.id ?? application.governance_proposal?.proposal_id ?? null;
  const effectiveDaoPolicy = resolveEffectiveDaoPolicy(proposal, daoPolicy);
  const proposalPolicyLabel = getProposalPolicyLabel(proposal);
  const viewerRole = findViewerRole(effectiveDaoPolicy, accountId);
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
  const periodMs = resolveProposalPeriodMs(proposal, effectiveDaoPolicy);
  const expiresAtMs =
    submissionMs != null && periodMs != null ? submissionMs + periodMs : null;
  const expired =
    proposal?.status === 'Expired' ||
    proposal?.status === 'Failed' ||
    (proposal?.status === 'InProgress' &&
      expiresAtMs != null &&
      expiresAtMs <= nowMs);

  const votingClosed =
    isTerminalProtocolProposalStatus(proposal?.status ?? null) ||
    (proposal?.status === 'InProgress' && expired);
  const votingRole = getProposalVotingRole(
    proposal,
    effectiveDaoPolicy,
    viewerRole,
    proposalPolicyLabel,
    votingClosed
  );

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
  const removedFromChain =
    proposalKindKey(proposal) === 'Removed' ||
    application.protocol_target_method?.trim().toLowerCase() === 'removed';
  const canApprove =
    !!viewerRole &&
    !!proposal &&
    status === 'InProgress' &&
    !votingClosed &&
    !currentVote &&
    roleAllowsAction(viewerRole, proposalPolicyLabel, 'VoteApprove');
  const canReject =
    !!viewerRole &&
    !!proposal &&
    status === 'InProgress' &&
    !votingClosed &&
    !currentVote &&
    roleAllowsAction(viewerRole, proposalPolicyLabel, 'VoteReject');
  const canRemove =
    !!viewerRole &&
    !!proposal &&
    status === 'InProgress' &&
    !votingClosed &&
    !currentVote &&
    roleAllowsAction(viewerRole, proposalPolicyLabel, 'VoteRemove');
  const votePolicy = resolveVotePolicy(
    votingRole,
    effectiveDaoPolicy,
    proposalPolicyLabel
  );
  const voteTallies = resolveProtocolProposalVoteTallies(
    proposal,
    votingRole,
    votePolicy
  );
  const approveVotes = voteTallies.approvals;
  const rejectVotes = voteTallies.rejects;
  const removeVotes = voteTallies.removes;
  const eligibleVoters = getEligibleVotersForProposal(
    votingRole,
    proposal,
    votingClosed
  );
  const votingProgress = getVotingProgress(
    votingRole,
    effectiveDaoPolicy,
    proposalPolicyLabel,
    approveVotes,
    rejectVotes,
    removeVotes,
    proposal,
    votingClosed
  );
  const thresholdMet =
    votingProgress.threshold != null &&
    votingProgress.approvals >= votingProgress.threshold;
  const canFinalize =
    !!viewerRole &&
    !!proposal &&
    (status === 'Expired' ||
      status === 'Failed' ||
      (status === 'InProgress' && (expired || thresholdMet))) &&
    roleAllowsAction(viewerRole, proposalPolicyLabel, 'Finalize');
  const votesIn =
    status === 'InProgress' && thresholdMet && !expired;

  const voteEntries = Object.entries(proposal?.votes ?? {}).sort(
    ([left], [right]) => {
      if (viewer && normalizeAccount(left) === viewer) return -1;
      if (viewer && normalizeAccount(right) === viewer) return 1;
      return left.localeCompare(right);
    }
  ) as Array<[string, ProtocolDaoVote]>;

  return {
    proposal,
    proposalId,
    headline: presentation.headline,
    description: proposalDescription(application, proposal),
    actionBadge:
      presentation.actionBadge ??
      proposalActionBadge(proposal, application.protocol_kind),
    status,
    statusLabel: votesIn ? 'Votes in' : statusLabel(effectiveStatus),
    statusTone: votesIn ? 'approved' : statusTone(status, expired),
    targetAccount: removedFromChain
      ? null
      : (presentation.targetAccountId ??
        application.protocol_target_account?.trim() ??
        null),
    targetMethod: removedFromChain
      ? null
      : application.protocol_target_method?.trim() || null,
    targetKind: presentation.targetKind,
    targetValue: presentation.targetValue,
    subjectAccount: presentation.subjectAccount,
    subjectText: presentation.subjectText,
    subjectEyebrow: presentation.subjectEyebrow,
    showProposerSeparately: presentation.showProposerSeparately,
    showProposerAsSelf: presentation.showProposerAsSelf,
    onChainAction: presentation.onChainAction,
    onChainActionKind: presentation.onChainActionKind,
    proposer: proposal?.proposer?.trim() || null,
    submission:
      submissionMs != null
        ? formatRelativeTimestamp(submissionMs, nowMs)
        : null,
    deadline,
    currentVote,
    canApprove,
    canReject,
    canRemove,
    canFinalize,
    finalizeLabel: effectiveStatus === 'Failed' ? 'Retry' : 'Finalize',
    approveVotes,
    rejectVotes,
    removeVotes,
    voteEntries,
    eligibleVoters,
    votingProgress,
    roleName: viewerRole?.name?.trim() || votingRole?.name?.trim() || null,
  };
}

export function isProtocolApplicationSoftExpired(
  application: ProtocolApplication,
  daoPolicy: ProtocolDaoPolicy | null,
  nowMs = Date.now()
): boolean {
  const proposal = resolveLiveProposal(application);
  if (!proposal || proposal.status !== 'InProgress') return false;
  const submissionMs = parseNanosecondsToMilliseconds(proposal.submission_time);
  const periodMs = resolveProposalPeriodMs(proposal, daoPolicy);
  if (submissionMs == null || periodMs == null) return false;
  return submissionMs + periodMs <= nowMs;
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

export function getProtocolProposalVotesCast(
  proposal: ProtocolDaoProposal | null | undefined
): number {
  if (!proposal) return 0;
  const mapTotal = Object.keys(proposal.votes ?? {}).length;
  if (mapTotal > 0) return mapTotal;
  return (
    sumVoteCounts(proposal.vote_counts, 0) +
    sumVoteCounts(proposal.vote_counts, 1) +
    sumVoteCounts(proposal.vote_counts, 2)
  );
}

export function isTerminalProtocolProposalStatus(
  status: ProtocolDaoProposalStatus | null | undefined
): boolean {
  return (
    status === 'Approved' ||
    status === 'Rejected' ||
    status === 'Removed' ||
    status === 'Failed' ||
    status === 'Expired' ||
    status === 'Moved'
  );
}

export function shouldAdoptProtocolProposalSnapshot(
  current: ProtocolDaoProposal | null | undefined,
  incoming: ProtocolDaoProposal | null | undefined
): boolean {
  if (!incoming) return false;
  if (!current) return true;

  const incomingTerminal = isTerminalProtocolProposalStatus(incoming.status);
  const currentTerminal = isTerminalProtocolProposalStatus(current.status);

  if (incomingTerminal && !currentTerminal) return true;
  if (currentTerminal && !incomingTerminal) return false;

  if (incoming.status !== current.status) return incomingTerminal;

  return (
    getProtocolProposalVotesCast(incoming) >=
    getProtocolProposalVotesCast(current)
  );
}

export function mergeProtocolProposalSnapshot(
  current: ProtocolDaoProposal | null | undefined,
  incoming: ProtocolDaoProposal | null | undefined
): ProtocolDaoProposal | null {
  if (!incoming) return current ?? null;
  if (
    !current ||
    shouldAdoptProtocolProposalSnapshot(current, incoming)
  ) {
    return {
      ...incoming,
      policy_snapshot:
        incoming.policy_snapshot ?? current?.policy_snapshot ?? null,
    };
  }

  return {
    ...current,
    policy_snapshot:
      current.policy_snapshot ?? incoming.policy_snapshot ?? null,
  };
}

export function mergeProtocolFeedApplications(
  current: ProtocolApplication[],
  incoming: ProtocolApplication[]
): ProtocolApplication[] {
  const currentByAppId = new Map(current.map((row) => [row.app_id, row]));
  return incoming.map((row) => {
    const previous = currentByAppId.get(row.app_id);
    if (!previous?.governance_proposal?.snapshot && !row.governance_proposal) {
      return row;
    }
    const gp = row.governance_proposal ?? previous?.governance_proposal;
    if (!gp) return row;
    const mergedSnapshot = mergeProtocolProposalSnapshot(
      resolveLiveProposal(previous ?? row),
      resolveLiveProposal(row)
    );
    if (!mergedSnapshot) return row;
    const previousSnapshot = previous?.governance_proposal?.snapshot ?? null;
    return {
      ...row,
      governance_proposal: {
        ...gp,
        status: mergedSnapshot.status,
        snapshot: {
          ...mergedSnapshot,
          policy_snapshot:
            mergedSnapshot.policy_snapshot ??
            previousSnapshot?.policy_snapshot ??
            null,
        },
        kind: mergedSnapshot.kind,
        description: mergedSnapshot.description,
      },
    };
  });
}

export function applyOptimisticVote(
  proposal: ProtocolDaoProposal,
  accountId: string,
  vote: ProtocolDaoVote,
  daoPolicy: ProtocolDaoPolicy | null = null
): ProtocolDaoProposal {
  const viewer = normalizeAccount(accountId);
  if (
    viewer &&
    proposal.votes &&
    Object.entries(proposal.votes).some(
      ([id]) => normalizeAccount(id) === viewer
    )
  ) {
    return proposal;
  }

  const viewerRole = findViewerRole(daoPolicy, accountId);
  const votingRole = getProposalVotingRole(
    proposal,
    daoPolicy,
    viewerRole,
    getProposalPolicyLabel(proposal)
  );
  const roleName = votingRole?.name?.trim() ?? 'council';
  const vote_counts = { ...proposal.vote_counts };
  const existing =
    vote_counts[roleName] ?? (['0', '0', '0'] as [string, string, string]);
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
      [accountId.trim()]: vote,
    },
    vote_counts,
  };
}
