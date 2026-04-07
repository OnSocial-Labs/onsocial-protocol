import React, { Fragment, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Vote, XCircle, type LucideIcon } from 'lucide-react';
import { fetchDaoPolicy, fetchDaoProposal } from '@/features/governance/api';
import type {
  GovernanceDaoAction,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
  GovernanceDaoRole,
  GovernanceDaoVotePolicy,
  GovernanceProposal,
} from '@/features/governance/types';
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

function getProposalExpiryTime({
  proposal,
  policy,
  nowMs,
}: {
  proposal: GovernanceDaoProposal | null;
  policy: GovernanceDaoPolicy | null;
  nowMs: number;
}): { relative: string; absolute: string; expired: boolean } | null {
  if (!proposal || proposal.status !== 'InProgress') {
    return null;
  }

  const submissionMs = parseNanosecondsToMilliseconds(proposal.submission_time);
  const proposalPeriodMs = parseNanosecondsToMilliseconds(
    policy?.proposal_period
  );

  if (submissionMs === null || proposalPeriodMs === null) {
    return null;
  }

  const expiresAtMs = submissionMs + proposalPeriodMs;
  const deltaMs = expiresAtMs - nowMs;

  return {
    relative: formatRelativeTimeFromDelta(deltaMs),
    absolute: new Date(expiresAtMs).toLocaleString(),
    expired: deltaMs <= 0,
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
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const open = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.bottom });
    }
    setShow(true);
  }, []);

  const close = useCallback(() => setShow(false), []);

  return (
    <>
      <span
        ref={ref}
        className={`cursor-help ${className ?? ''}`.trim()}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        tabIndex={0}
      >
        {relative}
      </span>
      {show &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[9999] w-max max-w-[16rem] -translate-x-1/2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-xs font-normal text-muted-foreground shadow-lg backdrop-blur-sm"
            style={{ left: pos.x, top: pos.y + 8 }}
          >
            {absolute}
          </span>,
          document.body
        )}
    </>
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
  const decodedArgs =
    'args' in firstAction && typeof firstAction.args === 'string'
      ? decodeBase64Json(firstAction.args)
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
  removeVotes: string
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
  const totalWeight = getRoleSize(role);

  if (
    !votePolicy ||
    votePolicy.weight_kind !== 'RoleWeight' ||
    totalWeight === null
  ) {
    return {
      threshold: null,
      totalWeight,
      approvals,
      rejects,
      removes,
      votesCast: approvals + rejects + removes,
      remainingVoters:
        totalWeight === null
          ? null
          : totalWeight - (approvals + rejects + removes),
      remaining: null,
      approvalStillPossible: null,
    };
  }

  const threshold = Math.max(
    Number(votePolicy.quorum ?? '0'),
    toThresholdWeight(votePolicy.threshold, totalWeight)
  );
  const votesCast = approvals + rejects + removes;
  const remainingVoters = Math.max(totalWeight - votesCast, 0);
  const remaining = Math.max(threshold - approvals, 0);

  return {
    threshold,
    totalWeight,
    approvals,
    rejects,
    removes,
    votesCast,
    remainingVoters,
    remaining,
    approvalStillPossible: approvals + remainingVoters >= threshold,
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
  const proposalPolicyLabel = getProposalPolicyLabel(liveProposal);
  const activeVotingRole =
    connectedRole ??
    (daoPolicy?.roles ?? []).find((role) =>
      roleAllowsAction(role, proposalPolicyLabel, 'VoteApprove')
    ) ??
    null;
  const currentVote = accountId
    ? (liveProposal?.votes?.[accountId] ?? null)
    : null;
  const canApprove =
    !!connectedRole &&
    !!liveProposal &&
    liveProposal.status === 'InProgress' &&
    !currentVote &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'VoteApprove');
  const canReject =
    !!connectedRole &&
    !!liveProposal &&
    liveProposal.status === 'InProgress' &&
    !currentVote &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'VoteReject');
  const canRemove =
    !!connectedRole &&
    !!liveProposal &&
    liveProposal.status === 'InProgress' &&
    !currentVote &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'VoteRemove');
  const reviewExpiry = getProposalExpiryTime({
    proposal: liveProposal,
    policy: daoPolicy,
    nowMs,
  });
  const canFinalize =
    !!connectedRole &&
    !!liveProposal &&
    (liveProposal.status === 'Expired' ||
      liveProposal.status === 'Failed' ||
      (liveProposal.status === 'InProgress' && !!reviewExpiry?.expired)) &&
    roleAllowsAction(connectedRole, proposalPolicyLabel, 'Finalize');
  const liveStatusStyle = liveProposal
    ? reviewExpiry?.expired && liveProposal.status === 'InProgress'
      ? DAO_STATUS_STYLES.Expired
      : (DAO_STATUS_STYLES[liveProposal.status] ?? DAO_STATUS_STYLES.InProgress)
    : null;
  const approveVotes = sumVotes(liveProposal?.vote_counts, 0);
  const rejectVotes = sumVotes(liveProposal?.vote_counts, 1);
  const removeVotes = sumVotes(liveProposal?.vote_counts, 2);
  const votingProgress = getVotingProgress(
    activeVotingRole,
    daoPolicy,
    proposalPolicyLabel,
    approveVotes,
    rejectVotes,
    removeVotes
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
    reviewExpiry?.expired && liveProposal?.status === 'InProgress'
      ? 'Expired'
      : (liveProposal?.status ?? null);
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
          liveProposal?.status === 'Approved'
            ? 'Approval transaction'
            : 'Latest action',
        href: actionTxHref,
      }
    : null;
  const resolvedOutcomeLabel = liveProposal
    ? getResolvedOutcomeLabel(liveProposal.status)
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
    voteEntries,
    submissionTime,
    reviewExpiry,
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
  };
}
