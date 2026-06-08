import React, { Fragment } from 'react';
import { CheckCircle2, Vote, XCircle, type LucideIcon } from 'lucide-react';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { fetchDaoPolicy, fetchDaoProposal } from '@/features/governance/api';
import {
  hasFrozenProposalPolicySnapshot,
  hasReliableVoteRuleContext,
  resolveEffectiveDaoPolicy,
} from '@/features/governance/governance-proposal-policy-snapshot';
import type {
  GovernanceDaoAction,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
  GovernanceDaoRole,
  GovernanceDaoVotePolicy,
  GovernanceProposal,
} from '@/features/governance/types';
import { isNearNamedAccountComplete } from '@/lib/portal-near-account';
import { yoctoToSocial } from '@/lib/near-rpc';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

function parseNanosecondsToMilliseconds(
  rawValue: string | null | undefined
): number | null {
  if (!rawValue) {
    return null;
  }

  try {
    const milliseconds = Number(BigInt(rawValue) / NANOSECONDS_PER_MILLISECOND);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  } catch {
    return null;
  }
}

function formatRelativeTimeFromDelta(deltaMs: number): string {
  const future = deltaMs >= 0;
  const absoluteMs = Math.abs(deltaMs);
  const totalMinutes = Math.max(1, Math.floor(absoluteMs / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let value = '';
  if (days > 0) {
    value = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    value = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    value = `${minutes}m`;
  }

  return future ? `in ${value}` : `${value} ago`;
}

/* ── JSON display helpers ──────────────────────────────────────── */

export function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

const JSON_TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g;

function renderHighlightedJsonLine(line: string) {
  const tokens: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(JSON_TOKEN_PATTERN)) {
    const token = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      tokens.push(line.slice(lastIndex, startIndex));
    }

    const isString = Boolean(match[1]);
    const isKey = Boolean(match[2]);
    const isKeyword = Boolean(match[3]);
    const isNumber = !isString && !isKeyword && /^-?\d/.test(token);

    let className = 'text-foreground/85';
    if (isKey) {
      className = 'portal-blue-text';
    } else if (isString) {
      className = 'portal-green-text';
    } else if (isKeyword) {
      className = token === 'null' ? 'portal-amber-text' : 'portal-purple-text';
    } else if (isNumber) {
      className = 'portal-purple-text';
    } else {
      className = 'text-muted-foreground';
    }

    tokens.push(
      <span key={`${startIndex}-${token}`} className={className}>
        {token}
      </span>
    );

    lastIndex = startIndex + token.length;
  }

  if (lastIndex < line.length) {
    tokens.push(line.slice(lastIndex));
  }

  return tokens;
}

export function renderHighlightedJson(json: string) {
  return json.split('\n').map((line, index, lines) => (
    <Fragment key={`${index}-${line}`}>
      {renderHighlightedJsonLine(line)}
      {index < lines.length - 1 ? '\n' : null}
    </Fragment>
  ));
}

export const DAO_STATUS_STYLES: Record<
  string,
  {
    stripClass: string;
    stripColor: string;
    textClass: string;
    label: string;
    barClass: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  InProgress: {
    stripClass: 'bg-[var(--portal-blue-border-strong)]',
    stripColor: 'var(--portal-blue-border-strong)',
    textClass: 'portal-blue-text',
    label: 'In review',
    barClass: 'bg-[var(--portal-blue-border-strong)]',
    badgeBg: 'bg-[var(--portal-blue-bg)]',
    badgeText: 'portal-blue-text',
  },
  Approved: {
    stripClass: 'bg-[var(--portal-green-border-strong)]',
    stripColor: 'var(--portal-green-border-strong)',
    textClass: 'portal-green-text',
    label: 'Approved',
    barClass: 'bg-[var(--portal-green-border-strong)]',
    badgeBg: 'bg-[var(--portal-green-bg)]',
    badgeText: 'portal-green-text',
  },
  Rejected: {
    stripClass: 'bg-[var(--portal-red-border-strong)]',
    stripColor: 'var(--portal-red-border-strong)',
    textClass: 'portal-red-text',
    label: 'Rejected',
    barClass: 'bg-[var(--portal-red-border-strong)]',
    badgeBg: 'bg-[var(--portal-red-bg)]',
    badgeText: 'portal-red-text',
  },
  Removed: {
    stripClass: 'bg-[var(--portal-red-border-strong)]',
    stripColor: 'var(--portal-red-border-strong)',
    textClass: 'portal-red-text',
    label: 'Removed',
    barClass: 'bg-[var(--portal-red-border-strong)]',
    badgeBg: 'bg-[var(--portal-red-bg)]',
    badgeText: 'portal-red-text',
  },
  Expired: {
    stripClass: 'bg-[var(--portal-amber-border-strong)]',
    stripColor: 'var(--portal-amber-border-strong)',
    textClass: 'portal-amber-text',
    label: 'Expired',
    barClass: 'bg-[var(--portal-amber-border-strong)]',
    badgeBg: 'bg-[var(--portal-amber-bg)]',
    badgeText: 'portal-amber-text',
  },
  Failed: {
    stripClass: 'bg-[var(--portal-amber-border-strong)]',
    stripColor: 'var(--portal-amber-border-strong)',
    textClass: 'portal-amber-text',
    label: 'Retry',
    barClass: 'bg-[var(--portal-amber-border-strong)]',
    badgeBg: 'bg-[var(--portal-amber-bg)]',
    badgeText: 'portal-amber-text',
  },
  Moved: {
    stripClass: 'bg-[var(--portal-blue-border-strong)]',
    stripColor: 'var(--portal-blue-border-strong)',
    textClass: 'portal-blue-text',
    label: 'Moved',
    barClass: 'bg-[var(--portal-blue-border-strong)]',
    badgeBg: 'bg-[var(--portal-blue-bg)]',
    badgeText: 'portal-blue-text',
  },
};

const PROPOSAL_KIND_TO_POLICY_LABEL: Record<string, string> = {
  ChangeConfig: 'config',
  ChangePolicy: 'policy',
  AddMemberToRole: 'add_member_to_role',
  RemoveMemberFromRole: 'remove_member_from_role',
  FunctionCall: 'call',
  UpgradeSelf: 'upgrade_self',
  UpgradeRemote: 'upgrade_remote',
  Transfer: 'transfer',
  SetStakingContract: 'set_vote_token',
  AddBounty: 'add_bounty',
  BountyDone: 'bounty_done',
  Vote: 'vote',
  FactoryInfoUpdate: 'factory_info_update',
  ChangePolicyAddOrUpdateRole: 'policy_add_or_update_role',
  ChangePolicyRemoveRole: 'policy_remove_role',
  ChangePolicyUpdateDefaultVotePolicy: 'policy_update_default_vote_policy',
  ChangePolicyUpdateParameters: 'policy_update_parameters',
};

const PROPOSAL_KIND_LABELS: Record<string, string> = {
  ChangeConfig: 'Config',
  ChangePolicy: 'Policy',
  AddMemberToRole: 'Add Member',
  RemoveMemberFromRole: 'Remove Member',
  FunctionCall: 'Function Call',
  UpgradeSelf: 'Upgrade',
  UpgradeRemote: 'Remote Upgrade',
  Transfer: 'Transfer',
  SetStakingContract: 'Staking',
  AddBounty: 'Bounty',
  BountyDone: 'Bounty Done',
  Vote: 'Vote',
  FactoryInfoUpdate: 'Factory Update',
  ChangePolicyAddOrUpdateRole: 'Update Role',
  ChangePolicyRemoveRole: 'Remove Role',
  ChangePolicyUpdateDefaultVotePolicy: 'Vote Policy',
  ChangePolicyUpdateParameters: 'Parameters',
};

function formatSubmissionTime(
  rawValue: string | null | undefined
): { relative: string; absolute: string } | null {
  if (!rawValue) {
    return null;
  }

  try {
    const milliseconds = parseNanosecondsToMilliseconds(rawValue);
    if (milliseconds === null || !Number.isFinite(milliseconds)) {
      return null;
    }

    return formatRelativeTimestamp(milliseconds);
  } catch {
    return null;
  }
}

function formatRelativeTimestamp(
  ms: number
): { relative: string; absolute: string } | null {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  const elapsedMs = Date.now() - date.getTime();
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));

  let relative = 'just now';
  if (elapsedSec >= 60 && elapsedSec < 3600) {
    relative = `${Math.floor(elapsedSec / 60)}m ago`;
  } else if (elapsedSec >= 3600 && elapsedSec < 86400) {
    relative = `${Math.floor(elapsedSec / 3600)}h ago`;
  } else if (elapsedSec >= 86400) {
    relative = `${Math.floor(elapsedSec / 86400)}d ago`;
  }

  return { relative, absolute: date.toLocaleString() };
}

export function formatIsoTimestamp(
  isoValue: string | null | undefined
): { relative: string; absolute: string } | null {
  if (!isoValue) return null;
  try {
    const ms = Date.parse(isoValue);
    return formatRelativeTimestamp(ms);
  } catch {
    return null;
  }
}

export type GovernanceProposalStatusSubtitle = {
  relative: string;
  absolute: string;
  tone: 'muted' | 'urgent';
};

const REVIEW_DEADLINE_STATUSES = new Set<GovernanceDaoProposal['status']>([
  'InProgress',
  'Expired',
  'Failed',
]);

const RESOLVED_SUBTITLE_STATUSES = new Set<GovernanceDaoProposal['status']>([
  'Approved',
  'Rejected',
  'Removed',
  'Moved',
]);

function getProposalReviewDeadline({
  proposal,
  policy,
  nowMs,
}: {
  proposal: GovernanceDaoProposal | null;
  policy: GovernanceDaoPolicy | null;
  nowMs: number;
}): { relative: string; absolute: string; expired: boolean } | null {
  if (!proposal || !REVIEW_DEADLINE_STATUSES.has(proposal.status)) {
    return null;
  }

  const timingPolicy = resolveProposalPolicyForTiming(proposal, policy);
  const submissionMs = parseNanosecondsToMilliseconds(proposal.submission_time);
  const proposalPeriodMs = parseNanosecondsToMilliseconds(
    timingPolicy?.proposal_period
  );

  if (submissionMs === null || proposalPeriodMs === null) {
    return null;
  }

  const expiresAtMs = submissionMs + proposalPeriodMs;
  const deltaMs = expiresAtMs - nowMs;
  const expired =
    deltaMs <= 0 ||
    proposal.status === 'Expired' ||
    proposal.status === 'Failed';

  return {
    relative: formatRelativeTimeFromDelta(deltaMs),
    absolute: new Date(expiresAtMs).toLocaleString(),
    expired,
  };
}

function getProposalStatusSubtitle({
  proposal,
  policy,
  nowMs,
}: {
  proposal: GovernanceDaoProposal | null;
  policy: GovernanceDaoPolicy | null;
  nowMs: number;
}): GovernanceProposalStatusSubtitle | null {
  const normalizedProposal = normalizeGovernanceDaoProposal(proposal);
  if (!normalizedProposal) {
    return null;
  }

  if (REVIEW_DEADLINE_STATUSES.has(normalizedProposal.status)) {
    const deadline = getProposalReviewDeadline({
      proposal: normalizedProposal,
      policy,
      nowMs,
    });
    if (!deadline) {
      return null;
    }

    return {
      relative: deadline.relative,
      absolute: deadline.absolute,
      tone: deadline.expired ? 'urgent' : 'muted',
    };
  }

  if (!RESOLVED_SUBTITLE_STATUSES.has(normalizedProposal.status)) {
    return null;
  }

  const resolvedMs = parseNanosecondsToMilliseconds(
    normalizedProposal.resolved_at
  );
  if (resolvedMs === null) {
    return null;
  }

  const resolvedTime = formatRelativeTimestamp(resolvedMs);
  if (!resolvedTime) {
    return null;
  }

  return {
    relative: resolvedTime.relative,
    absolute: resolvedTime.absolute,
    tone: 'muted',
  };
}

export function HoverTimestamp({
  relative,
  absolute,
  className,
}: {
  relative: string;
  absolute: string;
  className?: string;
}) {
  return (
    <PortalHoverTooltip
      className={className}
      tooltip={absolute}
      aria-label={absolute}
    >
      {relative}
    </PortalHoverTooltip>
  );
}

export function buildHandleUrl(value: string, kind: 'telegram' | 'x'): string {
  const normalizedHandle = value.trim().replace(/^@/, '');
  return kind === 'telegram'
    ? `https://t.me/${normalizedHandle}`
    : `https://x.com/${normalizedHandle}`;
}

export function formatActionLabel(action: GovernanceDaoAction): string {
  switch (action) {
    case 'VoteApprove':
      return 'approval vote';
    case 'VoteReject':
      return 'rejection vote';
    case 'VoteRemove':
      return 'remove vote';
    case 'Finalize':
      return 'finalization';
  }
}

function decodeBase64Json(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatSocialValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return `${yoctoToSocial(value)} SOCIAL`;
  } catch {
    return null;
  }
}

function getFunctionCallSummary(proposal: GovernanceDaoProposal | null): {
  receiverId: string;
  methodName: string;
  deposit: string | null;
  gas: string | null;
  config: Record<string, unknown> | null;
} | null {
  const functionCall = proposal?.kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return null;
  }

  const receiverId =
    'receiver_id' in functionCall &&
    typeof functionCall.receiver_id === 'string'
      ? functionCall.receiver_id
      : null;
  const actions =
    'actions' in functionCall && Array.isArray(functionCall.actions)
      ? functionCall.actions
      : [];
  const firstAction = actions[0];

  if (!receiverId || !firstAction || typeof firstAction !== 'object') {
    return null;
  }

  const methodName =
    'method_name' in firstAction && typeof firstAction.method_name === 'string'
      ? firstAction.method_name
      : null;
  const deposit =
    'deposit' in firstAction && typeof firstAction.deposit === 'string'
      ? firstAction.deposit
      : null;
  const gas =
    'gas' in firstAction && typeof firstAction.gas === 'string'
      ? firstAction.gas
      : null;
  const rawArgs = 'args' in firstAction ? firstAction.args : null;
  const decodedArgs =
    typeof rawArgs === 'string'
      ? decodeBase64Json(rawArgs)
      : rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : null;
  const config = decodedArgs?.config;

  return methodName
    ? {
        receiverId,
        methodName,
        deposit,
        gas,
        config:
          config && typeof config === 'object'
            ? (config as Record<string, unknown>)
            : null,
      }
    : null;
}

function isRelayerServiceAccount(accountId: string): boolean {
  return /relayer\.onsocial\./i.test(accountId);
}

function parseApplicantWalletFromDescription(
  description: string | null | undefined
): string | null {
  const match = description?.match(
    /Applicant wallet:\s*([a-z0-9][a-z0-9._-]*)/i
  );
  const candidate = match?.[1]?.trim().toLowerCase();
  if (candidate && isNearNamedAccountComplete(candidate)) {
    return candidate;
  }
  return null;
}

/** Partner community wallet from feed row or on-chain register_app config. */
export function resolvePartnerWalletFromProposal(
  appWalletId: string | null | undefined,
  liveProposal: GovernanceDaoProposal | null | undefined
): string | null {
  const applicantWallet = parseApplicantWalletFromDescription(
    liveProposal?.description
  );
  const fromFeed = appWalletId?.trim().toLowerCase() || null;

  if (
    fromFeed &&
    isNearNamedAccountComplete(fromFeed) &&
    (!isRelayerServiceAccount(fromFeed) || !applicantWallet)
  ) {
    return fromFeed;
  }

  if (applicantWallet) {
    return applicantWallet;
  }

  if (fromFeed && isNearNamedAccountComplete(fromFeed)) {
    return fromFeed;
  }

  const summary = getFunctionCallSummary(liveProposal ?? null);
  const callers = summary?.config?.authorized_callers;
  if (!Array.isArray(callers)) {
    return null;
  }

  const normalizedCallers = callers
    .filter((caller): caller is string => typeof caller === 'string')
    .map((caller) => caller.trim().toLowerCase())
    .filter(
      (caller) => caller.length > 0 && isNearNamedAccountComplete(caller)
    );

  const communityCaller = normalizedCallers.find(
    (caller) => !isRelayerServiceAccount(caller)
  );

  return communityCaller ?? normalizedCallers[0] ?? null;
}

function getStatusSummary(
  status: string,
  currentVote: string | null,
  canFinalize: boolean
): string {
  switch (status) {
    case 'InProgress':
      return currentVote
        ? "You've voted! Follow the rest of the review live."
        : 'Review is live — watch it unfold here.';
    case 'Approved':
      return 'All clear — approved and live on-chain.';
    case 'Rejected':
      return "Didn't make it through review. This one's closed.";
    case 'Removed':
      return 'Pulled from the review queue.';
    case 'Expired':
      return canFinalize
        ? "Time's up but the votes are in — finalize to approve."
        : 'Time ran out without enough votes.';
    case 'Failed':
      return canFinalize
        ? 'Passed review but something went wrong on-chain. Hit retry.'
        : 'Passed review but something went wrong. A Guardian will retry.';
    case 'Moved':
      return 'Moved to a different governance track.';
    default:
      return 'Live governance status is available here.';
  }
}

function getResolvedOutcomeLabel(status: string): string | null {
  switch (status) {
    case 'Approved':
      return 'Approved';
    case 'Rejected':
      return 'Not approved';
    case 'Removed':
      return 'Removed';
    case 'Moved':
      return 'Moved';
    default:
      return null;
  }
}

function getGuardianDecisionSummary({
  isConnected,
  isGuardian,
  proposalStatus,
  currentVote,
  canApprove,
  canReject,
  canFinalize,
  thresholdMet,
}: {
  isConnected: boolean;
  isGuardian: boolean;
  proposalStatus: string | null;
  currentVote: string | null;
  canApprove: boolean;
  canReject: boolean;
  canFinalize: boolean;
  thresholdMet: boolean;
}): { title: string; toneClass: string } {
  if (!isConnected) {
    if (proposalStatus === 'Approved') {
      return { title: 'Guardians approved', toneClass: 'portal-green-text' };
    }
    if (proposalStatus === 'Rejected') {
      return { title: 'Guardians rejected', toneClass: 'portal-red-text' };
    }
    if (proposalStatus === 'Removed') {
      return { title: 'Guardians removed', toneClass: 'portal-red-text' };
    }
    if (proposalStatus === 'Moved') {
      return { title: 'Moved', toneClass: 'text-muted-foreground' };
    }
    if (proposalStatus === 'Failed') {
      return {
        title: 'Approved but hit a snag — needs retry',
        toneClass: 'portal-amber-text',
      };
    }
    if (proposalStatus === 'Expired') {
      if (thresholdMet) {
        return {
          title: 'Votes are in — ready to finalize',
          toneClass: 'portal-green-text',
        };
      }
      return {
        title: 'Expired — not enough votes',
        toneClass: 'portal-amber-text',
      };
    }
    return { title: 'Guardians are reviewing', toneClass: 'portal-blue-text' };
  }

  if (!isGuardian) {
    if (proposalStatus === 'Approved') {
      return { title: 'Guardians approved', toneClass: 'portal-green-text' };
    }
    if (proposalStatus === 'Rejected') {
      return { title: 'Guardians rejected', toneClass: 'portal-red-text' };
    }
    if (proposalStatus === 'Removed') {
      return { title: 'Guardians removed', toneClass: 'portal-red-text' };
    }
    if (proposalStatus === 'Moved') {
      return { title: 'Moved', toneClass: 'text-muted-foreground' };
    }
    if (proposalStatus === 'Failed') {
      return {
        title: 'Approved but hit a snag — needs retry',
        toneClass: 'portal-amber-text',
      };
    }
    if (proposalStatus === 'Expired') {
      if (thresholdMet) {
        return {
          title: 'Votes are in — ready to finalize',
          toneClass: 'portal-green-text',
        };
      }
      return {
        title: 'Expired — not enough votes',
        toneClass: 'portal-amber-text',
      };
    }
    return { title: 'Guardians are reviewing', toneClass: 'portal-blue-text' };
  }

  if (proposalStatus === 'Moved') {
    return { title: 'Moved', toneClass: 'text-foreground' };
  }

  if (canFinalize) {
    if (proposalStatus === 'Failed') {
      return {
        title: 'Hit a snag — retry this one',
        toneClass: 'portal-amber-text',
      };
    }
    if (thresholdMet) {
      return { title: 'Ready to finalize', toneClass: 'portal-green-text' };
    }
    return { title: 'Finalize to close', toneClass: 'portal-amber-text' };
  }

  if (currentVote) {
    return { title: '', toneClass: '' };
  }

  if (canApprove || canReject) {
    return { title: 'Your review needed', toneClass: 'portal-blue-text' };
  }

  return { title: 'Nothing to do', toneClass: 'text-foreground' };
}

export function getVoteToneClass(
  vote: string,
  isConnectedVoter = false
): string {
  const emphasis = isConnectedVoter ? ' font-semibold' : ' font-medium';

  switch (vote) {
    case 'Approve':
      return `portal-green-text${emphasis}`;
    case 'Reject':
      return `portal-red-text${emphasis}`;
    case 'Remove':
      return `portal-amber-text${emphasis}`;
    default:
      return `text-foreground${emphasis}`;
  }
}

export function getCounterToneClass(
  kind: 'approve' | 'reject' | 'remove',
  count: string
): string {
  if (count === '0') {
    return 'text-foreground';
  }

  switch (kind) {
    case 'approve':
      return 'portal-green-text font-medium';
    case 'reject':
      return 'portal-red-text font-medium';
    case 'remove':
      return 'portal-amber-text font-medium';
  }
}

export function getVoteIcon(vote: string): LucideIcon {
  switch (vote) {
    case 'Approve':
      return CheckCircle2;
    case 'Reject':
      return XCircle;
    case 'Remove':
      return Vote;
    default:
      return Vote;
  }
}

function getGroupMembers(role: GovernanceDaoRole): string[] {
  return (role.kind?.Group ?? []).map((member) => member.toLowerCase());
}

function getProposalPolicyLabel(
  proposal: GovernanceDaoProposal | null
): string {
  const kindKey = Object.keys(proposal?.kind ?? {})[0];
  return PROPOSAL_KIND_TO_POLICY_LABEL[kindKey] ?? '*';
}

function roleAllowsAction(
  role: GovernanceDaoRole,
  proposalPolicyLabel: string,
  action: GovernanceDaoAction
): boolean {
  const permissions = role.permissions ?? [];
  return permissions.some((permission) => {
    return (
      permission === '*:*' ||
      permission === `*:${action}` ||
      permission === `${proposalPolicyLabel}:${action}`
    );
  });
}

function getRoleSize(role: GovernanceDaoRole): number | null {
  if (role.kind?.Group) {
    return role.kind.Group.length;
  }

  if (role.kind?.Member) {
    return null;
  }

  return null;
}

type MembershipProposalInfo = {
  kind: 'add' | 'remove';
  memberId: string;
  roleId: string | null;
};

export function normalizeDaoProposalStatus(
  status: GovernanceDaoProposal['status'] | string | null | undefined
): GovernanceDaoProposal['status'] | null {
  if (!status) {
    return null;
  }

  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  switch (normalized) {
    case 'approved':
    case 'executed':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'removed':
    case 'cancelled':
    case 'canceled':
      return 'Removed';
    case 'expired':
      return 'Expired';
    case 'failed':
    case 'executed_skipped':
      return 'Failed';
    case 'moved':
      return 'Moved';
    case 'inprogress':
    case 'in_progress':
    case 'active':
    case 'submitted':
    case 'draft':
      return 'InProgress';
    default:
      break;
  }

  if (
    status === 'Approved' ||
    status === 'Rejected' ||
    status === 'Removed' ||
    status === 'Failed' ||
    status === 'Expired' ||
    status === 'Moved' ||
    status === 'InProgress'
  ) {
    return status;
  }

  return null;
}

export function normalizeGovernanceDaoProposal(
  proposal: GovernanceDaoProposal | null | undefined
): GovernanceDaoProposal | null {
  if (!proposal) {
    return null;
  }

  const status = normalizeDaoProposalStatus(proposal.status);
  if (!status || status === proposal.status) {
    return proposal;
  }

  return {
    ...proposal,
    status,
  };
}

export function isTerminalGovernanceProposalStatus(
  status: GovernanceDaoProposal['status'] | string | null | undefined
): boolean {
  const normalized = normalizeDaoProposalStatus(status);
  return (
    normalized === 'Approved' ||
    normalized === 'Rejected' ||
    normalized === 'Removed' ||
    normalized === 'Failed' ||
    normalized === 'Expired' ||
    normalized === 'Moved'
  );
}

function resolveProposalPolicyForTiming(
  proposal: GovernanceDaoProposal | null,
  policy: GovernanceDaoPolicy | null
): GovernanceDaoPolicy | null {
  return policy ?? proposal?.policy_snapshot ?? null;
}

/** Voting is closed once the chain is terminal or the local review window elapsed. */
function isGovernanceVotingClosed(
  liveProposal: GovernanceDaoProposal | null,
  reviewDeadline: { expired: boolean } | null
): boolean {
  if (!liveProposal) {
    return false;
  }

  if (isTerminalGovernanceProposalStatus(liveProposal.status)) {
    return true;
  }

  return liveProposal.status === 'InProgress' && !!reviewDeadline?.expired;
}

function readMembershipProposalMemberId(
  liveProposal: GovernanceDaoProposal | null
): MembershipProposalInfo | null {
  if (!liveProposal?.kind) {
    return null;
  }

  const kindKey = Object.keys(liveProposal.kind)[0];
  if (kindKey !== 'AddMemberToRole' && kindKey !== 'RemoveMemberFromRole') {
    return null;
  }

  const payload = liveProposal.kind[kindKey];
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const memberId =
    'member_id' in payload && typeof payload.member_id === 'string'
      ? payload.member_id.trim().toLowerCase()
      : null;
  const roleId =
    'role' in payload && typeof payload.role === 'string'
      ? payload.role.trim()
      : null;

  if (!memberId) {
    return null;
  }

  return {
    kind: kindKey === 'AddMemberToRole' ? 'add' : 'remove',
    memberId,
    roleId,
  };
}

function getProposalVotingRole(
  liveProposal: GovernanceDaoProposal | null,
  daoPolicy: GovernanceDaoPolicy | null,
  connectedRole: GovernanceDaoRole | null,
  proposalPolicyLabel: string,
  votingClosed = false
): GovernanceDaoRole | null {
  const membership = readMembershipProposalMemberId(liveProposal);
  if (membership?.roleId && daoPolicy?.roles) {
    const targetRole = daoPolicy.roles.find(
      (role) => role.name === membership.roleId
    );
    if (targetRole) {
      return targetRole;
    }
  }

  const preferVoteTimePolicyRole =
    votingClosed && hasFrozenProposalPolicySnapshot(liveProposal);

  return (
    (preferVoteTimePolicyRole ? null : connectedRole) ??
    (daoPolicy?.roles ?? []).find((role) =>
      roleAllowsAction(role, proposalPolicyLabel, 'VoteApprove')
    ) ??
    null
  );
}

function getVotingPoolSize(
  role: GovernanceDaoRole,
  liveProposal: GovernanceDaoProposal | null,
  votingClosed = false
): number | null {
  const baseSize = getRoleSize(role);
  if (baseSize === null) {
    return null;
  }

  if (
    hasFrozenProposalPolicySnapshot(liveProposal) &&
    votingClosed &&
    liveProposal &&
    isTerminalGovernanceProposalStatus(liveProposal.status)
  ) {
    return baseSize;
  }

  const membership = readMembershipProposalMemberId(liveProposal);
  if (!membership) {
    return baseSize;
  }

  const members = getGroupMembers(role);
  const subjectInGroup = members.includes(membership.memberId);
  const votesCast = Object.keys(liveProposal?.votes ?? {}).length;

  if (membership.kind === 'add') {
    // After an approved add, policy already includes the nominee — vote-time pool was smaller.
    if (subjectInGroup && votingClosed && liveProposal?.status === 'Approved') {
      return Math.max(baseSize - 1, 0);
    }

    return baseSize;
  }

  if (membership.kind === 'remove') {
    if (subjectInGroup) {
      return baseSize;
    }

    // Subject not in current policy (already removed or never joined).
    if (votingClosed && liveProposal?.status === 'Approved') {
      // Vote-time pool included the removed member. Only add them back when the
      // current roster is still the pre-removal size (e.g. 2 guardians + leaver = 3).
      // If someone joined later (same headcount, different members), baseSize already matches.
      return baseSize <= votesCast ? baseSize + 1 : baseSize;
    }

    // In progress: subject still in the group at vote time, or edge-case removal nominee.
    return baseSize + 1;
  }

  return baseSize;
}

export function getEligibleVotersForProposal(
  role: GovernanceDaoRole | null,
  liveProposal: GovernanceDaoProposal | null,
  votingClosed = false
): string[] | null {
  if (
    liveProposal &&
    (isTerminalGovernanceProposalStatus(liveProposal.status) || votingClosed)
  ) {
    return Object.keys(liveProposal.votes ?? {})
      .map((account) => account.toLowerCase())
      .sort((left, right) => left.localeCompare(right));
  }

  if (!role?.kind?.Group) {
    return null;
  }

  const members = getGroupMembers(role);
  const membership = readMembershipProposalMemberId(liveProposal);
  if (!membership) {
    return members;
  }

  if (membership.kind === 'add') {
    return members.filter((member) => member !== membership.memberId);
  }

  if (members.includes(membership.memberId)) {
    return members;
  }

  return [...members, membership.memberId].sort((left, right) =>
    left.localeCompare(right)
  );
}

function resolveVotePolicy(
  role: GovernanceDaoRole,
  policy: GovernanceDaoPolicy | null,
  proposalPolicyLabel: string
): GovernanceDaoVotePolicy | null {
  return (
    role.vote_policy?.[proposalPolicyLabel] ??
    policy?.default_vote_policy ??
    null
  );
}

function toThresholdWeight(
  threshold: GovernanceDaoVotePolicy['threshold'],
  totalWeight: number
): number {
  if (typeof threshold === 'string') {
    return Math.min(Number(threshold), totalWeight);
  }

  const [numerator, denominator] = threshold;
  if (!denominator) {
    return totalWeight;
  }

  return Math.min(
    Math.floor((numerator * totalWeight) / denominator) + 1,
    totalWeight
  );
}

function getVotingProgress(
  role: GovernanceDaoRole | null,
  policy: GovernanceDaoPolicy | null,
  proposalPolicyLabel: string,
  approveVotes: string,
  rejectVotes: string,
  removeVotes: string,
  liveProposal: GovernanceDaoProposal | null,
  votingClosed = false
): {
  threshold: number | null;
  totalWeight: number | null;
  approvals: number;
  rejects: number;
  removes: number;
  votesCast: number;
  remainingVoters: number | null;
  remaining: number | null;
  approvalStillPossible: boolean | null;
} {
  const approvals = Number(approveVotes);
  const rejects = Number(rejectVotes);
  const removes = Number(removeVotes);
  if (!role) {
    return {
      threshold: null,
      totalWeight: null,
      approvals,
      rejects,
      removes,
      votesCast: approvals + rejects + removes,
      remainingVoters: null,
      remaining: null,
      approvalStillPossible: null,
    };
  }

  const votePolicy = resolveVotePolicy(role, policy, proposalPolicyLabel);
  const currentPoolSize = getVotingPoolSize(role, liveProposal, votingClosed);
  const votesCast = approvals + rejects + removes;
  const useHistoricalVotePool =
    liveProposal &&
    !hasFrozenProposalPolicySnapshot(liveProposal) &&
    (isTerminalGovernanceProposalStatus(liveProposal.status) || votingClosed) &&
    votesCast > 0 &&
    currentPoolSize !== null &&
    votesCast < currentPoolSize &&
    !readMembershipProposalMemberId(liveProposal);
  const poolForThreshold = useHistoricalVotePool ? votesCast : currentPoolSize;

  if (
    !votePolicy ||
    votePolicy.weight_kind !== 'RoleWeight' ||
    poolForThreshold === null
  ) {
    return {
      threshold: null,
      totalWeight: currentPoolSize,
      approvals,
      rejects,
      removes,
      votesCast,
      remainingVoters:
        currentPoolSize === null ? null : currentPoolSize - votesCast,
      remaining: null,
      approvalStillPossible: null,
    };
  }

  const threshold = Math.max(
    Number(votePolicy.quorum ?? '0'),
    toThresholdWeight(votePolicy.threshold, poolForThreshold)
  );
  // Always scale the bar to the full voter pool — not votesCast/threshold after resolve.
  const displayTotalWeight = currentPoolSize;
  const remainingVoters =
    liveProposal &&
    (isTerminalGovernanceProposalStatus(liveProposal.status) || votingClosed)
      ? 0
      : Math.max((currentPoolSize ?? 0) - votesCast, 0);
  const remaining = Math.max(threshold - approvals, 0);

  return {
    threshold,
    totalWeight: displayTotalWeight,
    approvals,
    rejects,
    removes,
    votesCast,
    remainingVoters,
    remaining,
    approvalStillPossible:
      liveProposal &&
      (isTerminalGovernanceProposalStatus(liveProposal.status) || votingClosed)
        ? approvals >= threshold
        : approvals + remainingVoters >= threshold,
  };
}

function sumVotes(
  voteCounts: Record<string, [string, string, string]> | undefined,
  index: number
): string {
  return Object.values(voteCounts ?? {}).reduce((total, counts) => {
    return (BigInt(total) + BigInt(counts[index] ?? '0')).toString();
  }, '0');
}

export function getGovernanceProposalVotesCast(
  proposal: GovernanceDaoProposal | null | undefined
): number {
  if (!proposal) {
    return 0;
  }

  return (
    Number(sumVotes(proposal.vote_counts, 0)) +
    Number(sumVotes(proposal.vote_counts, 1)) +
    Number(sumVotes(proposal.vote_counts, 2))
  );
}

export function shouldAdoptGovernanceProposalSnapshot(
  current: GovernanceDaoProposal | null | undefined,
  incoming: GovernanceDaoProposal | null | undefined
): boolean {
  if (!incoming) {
    return false;
  }

  if (!current) {
    return true;
  }

  const incomingTerminal = isTerminalGovernanceProposalStatus(incoming.status);
  const currentTerminal = isTerminalGovernanceProposalStatus(current.status);

  if (incomingTerminal && !currentTerminal) {
    return true;
  }

  if (incoming.status !== current.status) {
    return incomingTerminal;
  }

  return (
    getGovernanceProposalVotesCast(incoming) >=
    getGovernanceProposalVotesCast(current)
  );
}

export function mergeGovernanceProposalSnapshot(
  current: GovernanceDaoProposal | null | undefined,
  incoming: GovernanceDaoProposal | null | undefined
): GovernanceDaoProposal | null {
  if (!incoming) {
    return normalizeGovernanceDaoProposal(current);
  }

  const normalizedIncoming = normalizeGovernanceDaoProposal(incoming);
  if (!normalizedIncoming) {
    return normalizeGovernanceDaoProposal(current);
  }

  const normalizedCurrent = normalizeGovernanceDaoProposal(current);

  if (
    !normalizedCurrent ||
    shouldAdoptGovernanceProposalSnapshot(normalizedCurrent, normalizedIncoming)
  ) {
    return {
      ...normalizedIncoming,
      policy_snapshot:
        normalizedIncoming.policy_snapshot ??
        normalizedCurrent?.policy_snapshot ??
        undefined,
      resolved_at:
        normalizedIncoming.resolved_at ??
        normalizedCurrent?.resolved_at ??
        undefined,
    };
  }

  return {
    ...normalizedCurrent,
    policy_snapshot:
      normalizedCurrent.policy_snapshot ??
      normalizedIncoming.policy_snapshot ??
      undefined,
    resolved_at:
      normalizedCurrent.resolved_at ??
      normalizedIncoming.resolved_at ??
      undefined,
  };
}

function findConnectedDaoRole(
  daoPolicy: GovernanceDaoPolicy | null | undefined,
  accountId: string
): GovernanceDaoRole | null {
  const normalized = accountId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    (daoPolicy?.roles ?? []).find((role) =>
      getGroupMembers(role).includes(normalized)
    ) ?? null
  );
}

export function applyOptimisticGovernanceVote({
  proposal,
  accountId,
  action,
  daoPolicy,
}: {
  proposal: GovernanceDaoProposal;
  accountId: string;
  action: Extract<
    GovernanceDaoAction,
    'VoteApprove' | 'VoteReject' | 'VoteRemove'
  >;
  daoPolicy: GovernanceDaoPolicy | null;
}): GovernanceDaoProposal {
  if (proposal.votes?.[accountId]) {
    return proposal;
  }

  const connectedRole = findConnectedDaoRole(daoPolicy, accountId);
  const proposalPolicyLabel = getProposalPolicyLabel(proposal);
  const votingRole = getProposalVotingRole(
    proposal,
    daoPolicy,
    connectedRole,
    proposalPolicyLabel
  );
  const roleName = votingRole?.name?.trim();

  if (!roleName) {
    return proposal;
  }

  const voteLabel =
    action === 'VoteApprove'
      ? 'Approve'
      : action === 'VoteReject'
        ? 'Reject'
        : 'Remove';
  const voteIndex =
    voteLabel === 'Approve' ? 0 : voteLabel === 'Reject' ? 1 : 2;
  const vote_counts = { ...proposal.vote_counts };
  const existing = vote_counts[roleName] ?? ['0', '0', '0'];
  const nextCounts: [string, string, string] = [
    existing[0] ?? '0',
    existing[1] ?? '0',
    existing[2] ?? '0',
  ];

  nextCounts[voteIndex] = (BigInt(nextCounts[voteIndex]) + 1n).toString();
  vote_counts[roleName] = nextCounts;

  return {
    ...proposal,
    votes: {
      ...proposal.votes,
      [accountId]: voteLabel,
    },
    vote_counts,
  };
}

export async function loadLiveDaoState(
  daoAccountId: string,
  proposalId: number
) {
  const [policy, proposal] = await Promise.all([
    fetchDaoPolicy(daoAccountId),
    fetchDaoProposal(proposalId, daoAccountId),
  ]);

  return { policy, proposal };
}

export function deriveGovernanceCardView({
  accountId,
  isConnected,
  daoPolicy,
  liveProposal,
  proposal,
  actionTxHash,
  isAppWalletViewer,
  nowMs,
}: {
  accountId: string | null | undefined;
  isConnected: boolean;
  daoPolicy: GovernanceDaoPolicy | null;
  liveProposal: GovernanceDaoProposal | null;
  proposal: GovernanceProposal | null;
  actionTxHash: string | null;
  isAppWalletViewer: boolean;
  nowMs: number;
}) {
  const connectedRole = accountId
    ? ((daoPolicy?.roles ?? []).find((role) =>
        getGroupMembers(role).includes(accountId.toLowerCase())
      ) ?? null)
    : null;
  const normalizedLiveProposal = normalizeGovernanceDaoProposal(liveProposal);
  const reviewDeadline = getProposalReviewDeadline({
    proposal: normalizedLiveProposal,
    policy: daoPolicy,
    nowMs,
  });
  const statusSubtitle = getProposalStatusSubtitle({
    proposal: normalizedLiveProposal,
    policy: daoPolicy,
    nowMs,
  });
  const votingClosed = isGovernanceVotingClosed(
    normalizedLiveProposal,
    reviewDeadline
  );
  const effectiveDaoPolicy = resolveEffectiveDaoPolicy(
    normalizedLiveProposal,
    daoPolicy,
    votingClosed
  );
  const proposalPolicyLabel = getProposalPolicyLabel(normalizedLiveProposal);
  const activeVotingRole = getProposalVotingRole(
    normalizedLiveProposal,
    effectiveDaoPolicy,
    connectedRole,
    proposalPolicyLabel,
    votingClosed
  );
  const currentVote = accountId
    ? (liveProposal?.votes?.[accountId] ?? null)
    : null;
  const proposalStatus = normalizedLiveProposal?.status ?? null;
  const canApprove =
    !!connectedRole &&
    !!normalizedLiveProposal &&
    proposalStatus === 'InProgress' &&
    !votingClosed &&
    !currentVote &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'VoteApprove');
  const canReject =
    !!connectedRole &&
    !!normalizedLiveProposal &&
    proposalStatus === 'InProgress' &&
    !votingClosed &&
    !currentVote &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'VoteReject');
  const canRemove =
    !!connectedRole &&
    !!normalizedLiveProposal &&
    proposalStatus === 'InProgress' &&
    !votingClosed &&
    !currentVote &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'VoteRemove');
  const canFinalize =
    !!connectedRole &&
    !!normalizedLiveProposal &&
    (proposalStatus === 'Expired' ||
      proposalStatus === 'Failed' ||
      (proposalStatus === 'InProgress' && !!reviewDeadline?.expired)) &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'Finalize');
  const liveStatusStyle = normalizedLiveProposal
    ? reviewDeadline?.expired && proposalStatus === 'InProgress'
      ? DAO_STATUS_STYLES.Expired
      : (DAO_STATUS_STYLES[proposalStatus ?? 'InProgress'] ??
        DAO_STATUS_STYLES.InProgress)
    : null;
  const approveVotes = sumVotes(liveProposal?.vote_counts, 0);
  const rejectVotes = sumVotes(liveProposal?.vote_counts, 1);
  const removeVotes = sumVotes(liveProposal?.vote_counts, 2);
  const votingProgress = getVotingProgress(
    activeVotingRole,
    effectiveDaoPolicy,
    proposalPolicyLabel,
    approveVotes,
    rejectVotes,
    removeVotes,
    liveProposal,
    votingClosed
  );
  const eligibleVoterAccounts = getEligibleVotersForProposal(
    activeVotingRole,
    liveProposal,
    votingClosed
  );
  const voteEntries = Object.entries(liveProposal?.votes ?? {}).sort(
    ([leftAccount], [rightAccount]) => {
      if (accountId && leftAccount === accountId) return -1;
      if (accountId && rightAccount === accountId) return 1;
      return leftAccount.localeCompare(rightAccount);
    }
  );
  const submissionTime = formatSubmissionTime(
    liveProposal?.submission_time ?? proposal?.submitted_at
  );
  const effectiveStatus =
    reviewDeadline?.expired && proposalStatus === 'InProgress'
      ? 'Expired'
      : proposalStatus;
  const statusSummary = liveProposal
    ? getStatusSummary(
        effectiveStatus ?? 'InProgress',
        currentVote,
        canFinalize
      )
    : null;
  const functionCallSummary = getFunctionCallSummary(liveProposal);
  const rewardPerActionValue = functionCallSummary?.config
    ? formatSocialValue(functionCallSummary.config.reward_per_action)
    : null;
  const dailyCapValue = functionCallSummary?.config
    ? formatSocialValue(functionCallSummary.config.daily_cap)
    : null;
  const dailyBudgetValue = functionCallSummary?.config
    ? formatSocialValue(functionCallSummary.config.daily_budget)
    : null;
  const totalBudgetValue = functionCallSummary?.config
    ? formatSocialValue(functionCallSummary.config.total_budget)
    : null;
  const attachedDepositValue =
    functionCallSummary?.deposit && functionCallSummary.deposit !== '0'
      ? functionCallSummary.deposit
      : null;
  const authorizedCallers = Array.isArray(
    functionCallSummary?.config?.authorized_callers
  )
    ? functionCallSummary.config.authorized_callers.filter(
        (caller): caller is string => typeof caller === 'string'
      )
    : [];
  const methodDisplay = functionCallSummary?.methodName
    ? functionCallSummary.methodName.replace(/_/g, ' ')
    : null;
  const methodSummaryLead = methodDisplay
    ? `${methodDisplay.charAt(0).toUpperCase()}${methodDisplay.slice(1)}`
    : null;
  const proposalSummaryParts = [
    methodSummaryLead ? `${methodSummaryLead} rewards` : null,
    rewardPerActionValue ? `at ${rewardPerActionValue} per action` : null,
    dailyBudgetValue ? `${dailyBudgetValue} daily budget` : null,
  ].filter((part): part is string => !!part);
  const proposalSummaryText = proposalSummaryParts.length
    ? `${proposalSummaryParts.join(' · ')}.`
    : null;
  const proposalTxHref = proposal?.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;
  const actionTxHref = actionTxHash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${actionTxHash}`
    : null;
  const latestActionLink = actionTxHref
    ? {
        label:
          proposalStatus === 'Approved'
            ? 'Approval transaction'
            : 'Latest action',
        href: actionTxHref,
      }
    : null;
  const resolvedOutcomeLabel = proposalStatus
    ? getResolvedOutcomeLabel(proposalStatus)
    : null;
  const guardianDecisionSummary = getGuardianDecisionSummary({
    isConnected,
    isGuardian: !!connectedRole,
    proposalStatus: effectiveStatus,
    currentVote,
    canApprove,
    canReject,
    canFinalize,
    thresholdMet:
      votingProgress.threshold !== null &&
      votingProgress.approvals >= votingProgress.threshold,
  });
  const showUsageMetrics = isAppWalletViewer || !!connectedRole;
  const finalizeLabel = effectiveStatus === 'Failed' ? 'Retry' : 'Finalize';
  const proposalKindKey = liveProposal?.kind
    ? Object.keys(liveProposal.kind)[0]
    : null;
  const proposalKindLabel = proposalKindKey
    ? (PROPOSAL_KIND_LABELS[proposalKindKey] ??
      proposalKindKey.replace(/([a-z])([A-Z])/g, '$1 $2'))
    : null;
  const showVoteRule = hasReliableVoteRuleContext(liveProposal, votingClosed);

  return {
    connectedRole,
    activeVotingRole,
    currentVote,
    canApprove,
    canReject,
    canRemove,
    canFinalize,
    liveStatusStyle,
    approveVotes,
    rejectVotes,
    removeVotes,
    votingProgress,
    eligibleVoterAccounts,
    voteEntries,
    submissionTime,
    statusSubtitle,
    statusSummary,
    functionCallSummary,
    rewardPerActionValue,
    dailyCapValue,
    dailyBudgetValue,
    totalBudgetValue,
    attachedDepositValue,
    authorizedCallers,
    proposalSummaryText,
    proposalTxHref,
    latestActionLink,
    resolvedOutcomeLabel,
    guardianDecisionSummary,
    showUsageMetrics,
    finalizeLabel,
    proposalKindLabel,
    showVoteRule,
  };
}
