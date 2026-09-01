import type { Proposal, ProposalStatus, ProposalTally } from '@onsocial/sdk';
import { PERMISSION } from '@onsocial/sdk';
import { fallbackLabel } from '@/lib/profile-display';
import { formatPostTimestamp } from '@/lib/post-display';

const BPS_DENOMINATOR = 10_000;
const NS_PER_MS = 1_000_000n;
const NS_PER_SECOND = 1_000_000_000n;
const NS_PER_MINUTE = 60n * NS_PER_SECOND;
const NS_PER_HOUR = 60n * NS_PER_MINUTE;
const NS_PER_DAY = 24n * NS_PER_HOUR;

export interface GuildProposalPresentation {
  kind: string;
  kindTone: 'role' | 'access' | 'governance' | 'default';
  headline: string;
  targetAccountId: string | null;
  targetLabel: string | null;
  roleLabel: string | null;
  detail: string | null;
  proposerLabel: string | null;
  suppressDescription: boolean;
}

const CHAIN_PERMISSION_TITLE_RE =
  /^Change Permission for (.+) to level (\d+)$/i;
const CHAIN_PATH_GRANT_TITLE_RE =
  /^Grant Path Permission on (.+) to (.+)$/i;
const CHAIN_PATH_REVOKE_TITLE_RE =
  /^Revoke Path Permission on (.+) from (.+)$/i;
const SPACE_WRITE_PATH_RE =
  /^groups\/[^/]+\/spaces\/([^/]+)\/write\/?$/i;

function readNestedRecord(
  value: unknown
): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readProposalDataRecord(
  proposal: Proposal,
  ...keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const nested = readNestedRecord(proposal.data[key]);
    if (nested) return nested;
  }
  return null;
}

function humanizeSpaceId(spaceId: string): string {
  return spaceId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function roomTitleFromSpaceWritePath(path: string): string | null {
  const match = path.trim().match(SPACE_WRITE_PATH_RE);
  if (!match?.[1]) return null;
  return humanizeSpaceId(match[1]);
}

function readPathPermissionFields(proposal: Proposal): {
  targetAccountId: string | null;
  path: string | null;
  reason: string | null;
} {
  const nested = readProposalDataRecord(
    proposal,
    'PathPermissionGrant',
    'path_permission_grant',
    'PathPermissionRevoke',
    'path_permission_revoke'
  );

  const nestedTarget =
    typeof nested?.target_user === 'string' ? nested.target_user.trim() : '';
  const nestedPath = typeof nested?.path === 'string' ? nested.path.trim() : '';
  const nestedReason =
    typeof nested?.reason === 'string' ? nested.reason.trim() : '';

  const directTarget =
    typeof proposal.target === 'string' ? proposal.target.trim() : '';
  const directPath =
    typeof proposal.data.path === 'string' ? proposal.data.path.trim() : '';
  const directReason =
    typeof proposal.data.reason === 'string'
      ? proposal.data.reason.trim()
      : '';

  let titlePath: string | null = null;
  let titleTarget: string | null = null;
  const grantMatch = proposal.title?.trim().match(CHAIN_PATH_GRANT_TITLE_RE);
  if (grantMatch) {
    titlePath = grantMatch[1]?.trim() || null;
    titleTarget = grantMatch[2]?.trim() || null;
  } else {
    const revokeMatch = proposal.title?.trim().match(CHAIN_PATH_REVOKE_TITLE_RE);
    if (revokeMatch) {
      titlePath = revokeMatch[1]?.trim() || null;
      titleTarget = revokeMatch[2]?.trim() || null;
    }
  }

  return {
    targetAccountId: nestedTarget || directTarget || titleTarget,
    path: nestedPath || directPath || titlePath,
    reason:
      nestedReason ||
      directReason ||
      (typeof proposal.description === 'string'
        ? proposal.description.trim()
        : '') ||
      null,
  };
}

export function readPermissionChangeLevel(proposal: Proposal): number | null {
  if (proposal.type !== 'permission_change') return null;

  const nested = readNestedRecord(
    proposal.data.PermissionChange ?? proposal.data.permission_change
  );
  const nestedLevel = nested?.level;
  if (typeof nestedLevel === 'number' && Number.isFinite(nestedLevel)) {
    return nestedLevel;
  }

  const direct = proposal.data.level;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  const titleMatch = proposal.title?.trim().match(CHAIN_PERMISSION_TITLE_RE);
  if (titleMatch) {
    const level = Number(titleMatch[2]);
    return Number.isFinite(level) ? level : null;
  }

  return null;
}

export function readPermissionChangeTarget(proposal: Proposal): string | null {
  const target = typeof proposal.target === 'string' ? proposal.target.trim() : '';
  if (target) return target;

  const nested = readNestedRecord(
    proposal.data.PermissionChange ?? proposal.data.permission_change
  );
  const nestedTarget = nested?.target_user;
  if (typeof nestedTarget === 'string' && nestedTarget.trim()) {
    return nestedTarget.trim();
  }

  const direct = proposal.data.target_user;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const titleMatch = proposal.title?.trim().match(CHAIN_PERMISSION_TITLE_RE);
  return titleMatch?.[1]?.trim() || null;
}

function readPermissionChangeReason(proposal: Proposal): string | null {
  const nested = readNestedRecord(
    proposal.data.PermissionChange ?? proposal.data.permission_change
  );
  const reason = nested?.reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

export function guildPermissionRoleLabel(level: number): string {
  if (level <= PERMISSION.NONE) return 'Member';
  if (level >= PERMISSION.MANAGE) return 'Admin';
  if (level >= PERMISSION.MODERATE) return 'Moderator';
  return 'Member';
}

function permissionChangeHeadline(
  targetAccountId: string,
  level: number
): { headline: string; roleLabel: string } {
  const name = fallbackLabel(targetAccountId);
  const roleLabel = guildPermissionRoleLabel(level);

  if (level <= PERMISSION.NONE) {
    return {
      headline: `Reset ${name} to member`,
      roleLabel: 'Member',
    };
  }

  const article =
    roleLabel === 'Admin'
      ? 'an'
      : roleLabel === 'Moderator'
        ? 'a'
        : 'a';

  return {
    headline: `Make ${name} ${article} ${roleLabel}`,
    roleLabel,
  };
}

function isChainGeneratedCopy(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return (
    CHAIN_PERMISSION_TITLE_RE.test(trimmed) ||
    CHAIN_PATH_GRANT_TITLE_RE.test(trimmed) ||
    CHAIN_PATH_REVOKE_TITLE_RE.test(trimmed) ||
    /^Change Permission for /i.test(trimmed) ||
    /^Update Group:/i.test(trimmed) ||
    /^Grant Path Permission /i.test(trimmed) ||
    /^Revoke Path Permission /i.test(trimmed) ||
    /^Invite Member /i.test(trimmed) ||
    /^Join Request from /i.test(trimmed) ||
    /^path permission (grant|revoke)$/i.test(trimmed) ||
    /^group update(?: metadata)?$/i.test(trimmed)
  );
}

function readGroupUpdateFields(proposal: Proposal): {
  updateType: string | null;
  targetAccountId: string | null;
  reason: string | null;
} {
  const nested = readProposalDataRecord(proposal, 'GroupUpdate', 'group_update');
  const nestedType =
    typeof nested?.update_type === 'string' ? nested.update_type.trim() : '';
  const nestedTarget =
    typeof nested?.target_user === 'string' ? nested.target_user.trim() : '';
  const nestedReason =
    typeof nested?.reason === 'string' ? nested.reason.trim() : '';

  const directType =
    typeof proposal.data.update_type === 'string'
      ? proposal.data.update_type.trim()
      : '';
  const directTarget =
    typeof proposal.data.target_user === 'string'
      ? proposal.data.target_user.trim()
      : typeof proposal.target === 'string'
        ? proposal.target.trim()
        : '';
  const directReason =
    typeof proposal.data.reason === 'string'
      ? proposal.data.reason.trim()
      : '';

  const typeFromProposal =
    proposal.type === 'group_update_ban'
      ? 'ban'
      : proposal.type === 'group_update_unban'
        ? 'unban'
        : proposal.type === 'group_update_remove_member'
          ? 'remove_member'
          : proposal.type === 'group_update_transfer_ownership'
            ? 'transfer_ownership'
            : proposal.type === 'group_update_metadata'
              ? 'metadata'
              : null;

  return {
    updateType: nestedType || directType || typeFromProposal,
    targetAccountId: nestedTarget || directTarget || null,
    reason:
      nestedReason ||
      directReason ||
      (typeof proposal.description === 'string'
        ? proposal.description.trim()
        : '') ||
      null,
  };
}

export function guildProposalPresentation(
  proposal: Proposal
): GuildProposalPresentation {
  const proposerLabel = proposal.proposer
    ? fallbackLabel(proposal.proposer)
    : null;

  if (proposal.type === 'permission_change') {
    const targetAccountId = readPermissionChangeTarget(proposal);
    const level = readPermissionChangeLevel(proposal);
    const reason = readPermissionChangeReason(proposal);

    if (targetAccountId && level != null) {
      const { headline, roleLabel } = permissionChangeHeadline(
        targetAccountId,
        level
      );
      return {
        kind: 'Role',
        kindTone: 'role',
        headline,
        targetAccountId,
        targetLabel: fallbackLabel(targetAccountId),
        roleLabel,
        detail: reason,
        proposerLabel,
        suppressDescription: true,
      };
    }
  }

  if (proposal.type === 'join_request') {
    const requester =
      readPermissionChangeTarget(proposal) ??
      (typeof proposal.target === 'string' ? proposal.target : null);
    return {
      kind: 'Join',
      kindTone: 'access',
      headline: requester
        ? `${fallbackLabel(requester)} requested to join`
        : 'Membership request',
      targetAccountId: requester,
      targetLabel: requester ? fallbackLabel(requester) : null,
      roleLabel: null,
      detail: proposal.description?.trim() || null,
      proposerLabel,
      suppressDescription: isChainGeneratedCopy(proposal.title),
    };
  }

  if (
    proposal.type === 'path_permission_grant' ||
    proposal.type === 'path_permission_revoke'
  ) {
    const { targetAccountId, path, reason } = readPathPermissionFields(proposal);
    const roomTitle = path ? roomTitleFromSpaceWritePath(path) : null;
    const isGrant = proposal.type === 'path_permission_grant';
    const name = targetAccountId ? fallbackLabel(targetAccountId) : null;
    const cleanedReason =
      reason && !isChainGeneratedCopy(reason) ? reason : null;

    let headline: string;
    if (cleanedReason) {
      headline = cleanedReason;
    } else if (roomTitle) {
      headline = isGrant
        ? `Allow to share in ${roomTitle}`
        : `Remove from ${roomTitle}`;
    } else if (name) {
      headline = isGrant
        ? `Allow ${name} to share in a room`
        : `Remove ${name} from a room`;
    } else {
      headline = isGrant ? 'Allow room sharing' : 'Remove room sharing';
    }

    return {
      kind: 'Room',
      kindTone: 'access',
      headline,
      targetAccountId,
      targetLabel: targetAccountId ? fallbackLabel(targetAccountId) : null,
      roleLabel: null,
      detail: null,
      proposerLabel,
      suppressDescription: true,
    };
  }

  const groupUpdate = readGroupUpdateFields(proposal);
  if (
    proposal.type === 'group_update_ban' ||
    proposal.type === 'group_update_unban' ||
    groupUpdate.updateType === 'ban' ||
    groupUpdate.updateType === 'unban'
  ) {
    const isBan =
      proposal.type === 'group_update_ban' || groupUpdate.updateType === 'ban';
    const targetAccountId = groupUpdate.targetAccountId;
    const name = targetAccountId ? fallbackLabel(targetAccountId) : null;
    const cleanedReason =
      groupUpdate.reason && !isChainGeneratedCopy(groupUpdate.reason)
        ? groupUpdate.reason
        : null;

    return {
      kind: isBan ? 'Ban' : 'Unban',
      kindTone: 'access',
      headline: name
        ? isBan
          ? `Ban ${name}`
          : `Unban ${name}`
        : isBan
          ? 'Ban member'
          : 'Unban member',
      targetAccountId,
      targetLabel: name,
      roleLabel: null,
      detail: cleanedReason,
      proposerLabel,
      suppressDescription: true,
    };
  }

  if (
    proposal.type === 'group_update_metadata' ||
    proposal.type === 'group_update'
  ) {
    const description = cleanProposalDescription(proposal.description);
    return {
      kind: 'Update',
      kindTone: 'governance',
      headline: description ?? 'Update guild settings',
      targetAccountId: null,
      targetLabel: null,
      roleLabel: null,
      detail: null,
      proposerLabel,
      suppressDescription: true,
    };
  }

  const customTitle = proposal.title?.trim();
  if (customTitle && !isChainGeneratedCopy(customTitle)) {
    return {
      kind: guildProposalKindFromType(proposal.type),
      kindTone: proposalKindTone(proposal.type),
      headline: customTitle,
      targetAccountId:
        typeof proposal.target === 'string' ? proposal.target : null,
      targetLabel:
        typeof proposal.target === 'string'
          ? fallbackLabel(proposal.target)
          : null,
      roleLabel: null,
      detail: cleanProposalDescription(proposal.description),
      proposerLabel,
      suppressDescription: false,
    };
  }

  return {
    kind: guildProposalKindFromType(proposal.type),
    kindTone: proposalKindTone(proposal.type),
    headline: guildProposalFallbackTitle(proposal),
    targetAccountId:
      typeof proposal.target === 'string' ? proposal.target : null,
    targetLabel:
      typeof proposal.target === 'string' ? fallbackLabel(proposal.target) : null,
    roleLabel: null,
    detail: cleanProposalDescription(proposal.description),
    proposerLabel,
    suppressDescription: isChainGeneratedCopy(proposal.description),
  };
}

export function guildProposalKindFromType(type: string): string {
  switch (type) {
    case 'permission_change':
      return 'Role';
    case 'member_invite':
      return 'Invite';
    case 'join_request':
      return 'Join';
    case 'path_permission_grant':
    case 'path_permission_revoke':
      return 'Room';
    case 'group_update_ban':
      return 'Ban';
    case 'group_update_unban':
      return 'Unban';
    case 'group_update_metadata':
    case 'group_update':
      return 'Update';
    case 'transfer_ownership':
    case 'group_update_transfer_ownership':
      return 'Ownership';
    case 'custom_proposal':
      return 'Proposal';
    case 'voting_config_change':
      return 'Governance';
    default:
      return 'Proposal';
  }
}

function proposalKindTone(
  type: string
): GuildProposalPresentation['kindTone'] {
  switch (type) {
    case 'permission_change':
      return 'role';
    case 'join_request':
    case 'member_invite':
    case 'path_permission_grant':
    case 'path_permission_revoke':
    case 'group_update_ban':
    case 'group_update_unban':
      return 'access';
    case 'voting_config_change':
    case 'transfer_ownership':
    case 'group_update_transfer_ownership':
    case 'group_update_metadata':
    case 'group_update':
      return 'governance';
    default:
      return 'default';
  }
}

function guildProposalFallbackTitle(proposal: Proposal): string {
  switch (proposal.type) {
    case 'permission_change':
      return 'Role change';
    case 'path_permission_grant':
      return 'Allow room sharing';
    case 'path_permission_revoke':
      return 'Remove room sharing';
    case 'group_update_ban':
      return 'Ban member';
    case 'group_update_unban':
      return 'Unban member';
    case 'group_update_metadata':
    case 'group_update':
      return 'Update guild settings';
    case 'transfer_ownership':
    case 'group_update_transfer_ownership':
      return 'Transfer ownership';
    case 'member_invite':
      return 'Invite member';
    case 'custom_proposal':
      return 'Guild proposal';
    default:
      return proposal.type.replaceAll('_', ' ');
  }
}

function cleanProposalDescription(description: string | null | undefined): string | null {
  const trimmed = description?.trim();
  if (!trimmed || isChainGeneratedCopy(trimmed)) return null;
  return trimmed;
}

/** @deprecated Prefer `guildProposalPresentation(proposal).headline`. */
export function guildProposalTitle(proposal: Proposal): string {
  return guildProposalPresentation(proposal).headline;
}

/** @deprecated Prefer `guildProposalPresentation(proposal).detail`. */
export function guildProposalDescription(proposal: Proposal): string | null {
  const presentation = guildProposalPresentation(proposal);
  if (presentation.suppressDescription) {
    return presentation.detail;
  }
  return presentation.detail ?? cleanProposalDescription(proposal.description);
}

export function guildProposalMetaLine(input: {
  proposal: Proposal;
  tally: ProposalTally | null;
  presentation?: GuildProposalPresentation;
}): string {
  const presentation =
    input.presentation ?? guildProposalPresentation(input.proposal);
  const parts: string[] = [];

  if (presentation.proposerLabel) {
    parts.push(`Proposed by ${presentation.proposerLabel}`);
  }

  const tallyLabel = guildProposalTallyLabel(input.tally);
  if (tallyLabel) parts.push(tallyLabel);

  parts.push(`#${input.proposal.sequence_number}`);

  return parts.join(' · ');
}

export function guildProposalTallyLabel(
  tally: ProposalTally | null
): string | null {
  if (!tally) return null;
  const yes = Number(tally.yes_votes) || 0;
  const total = Number(tally.total_votes) || 0;
  if (total <= 0) return 'No votes yet';
  return `${yes} supported · ${total} voted`;
}

export function guildViewerVoteLabel(approve: boolean): string {
  return approve ? 'You supported' : 'You opposed';
}

export type GuildProposalOutcomeTone =
  | 'active'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface GuildProposalOutcome {
  tone: GuildProposalOutcomeTone;
  stripLabel: string | null;
  footerLabel: string | null;
  isTerminal: boolean;
}

export function guildProposalOutcome(
  proposal: Proposal,
  presentation?: GuildProposalPresentation
): GuildProposalOutcome {
  const resolvedPresentation =
    presentation ?? guildProposalPresentation(proposal);

  switch (proposal.status as ProposalStatus) {
    case 'executed':
    case 'executed_skipped':
      return {
        tone: 'approved',
        stripLabel: 'Approved',
        footerLabel: resolvedPresentation.roleLabel
          ? `${resolvedPresentation.roleLabel} role applied`
          : resolvedPresentation.kind === 'Room'
            ? 'Room access applied'
            : resolvedPresentation.kind === 'Ban'
              ? 'Ban applied'
              : resolvedPresentation.kind === 'Unban'
                ? 'Unban applied'
                : resolvedPresentation.kind === 'Update'
                  ? 'Guild updated'
                  : 'Approved and applied',
        isTerminal: true,
      };
    case 'rejected':
      return {
        tone: 'rejected',
        stripLabel: 'Not passed',
        footerLabel: 'Proposal did not pass',
        isTerminal: true,
      };
    case 'cancelled':
      return {
        tone: 'cancelled',
        stripLabel: 'Cancelled',
        footerLabel: 'Withdrawn by proposer',
        isTerminal: true,
      };
    default:
      return {
        tone: 'active',
        stripLabel: null,
        footerLabel: null,
        isTerminal: false,
      };
  }
}

export function isTerminalGuildProposalStatus(status: string): boolean {
  return status !== 'active';
}

/** One-word chip / picker status. Snapshot or live indexer status. */
export function guildProposalStatusChipLabel(
  status: string | null | undefined
): string | null {
  switch (status?.trim()) {
    case 'active':
      return 'Open';
    case 'executed':
    case 'executed_skipped':
      return 'Approved';
    case 'rejected':
      return 'Not passed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return null;
  }
}

export function partitionGuildGovernanceProposals(proposals: Proposal[]): {
  active: Proposal[];
  resolved: Proposal[];
} {
  const governance = proposals.filter(
    (proposal) => proposal.type !== 'join_request'
  );
  const active = governance.filter((proposal) => proposal.status === 'active');
  const resolved = governance
    .filter((proposal) => proposal.status !== 'active')
    .slice(0, 5);
  return { active, resolved };
}

export interface GuildProposalVoteProgress {
  yesVotes: number;
  noVotes: number;
  totalVotes: number;
  memberPool: number;
  quorumVotesRequired: number;
  supportPoolPercent: number;
  opposePoolPercent: number;
  quorumMarkerPercent: number;
  label: string;
  closesLabel: string | null;
  closesTitle: string | null;
  ariaLabel: string;
  showProgress: boolean;
}

export function parseVotingPeriodNs(
  value: string | number | null | undefined
): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)([dhms])$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2]!.toLowerCase();
  const unitNs =
    unit === 'd'
      ? NS_PER_DAY
      : unit === 'h'
        ? NS_PER_HOUR
        : unit === 'm'
          ? NS_PER_MINUTE
          : NS_PER_SECOND;

  return BigInt(Math.round(amount * Number(unitNs)));
}

function resolveTimestampNs(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

export function guildProposalVotingDeadline(
  proposal: Proposal,
  tally: ProposalTally | null
): Date | null {
  const periodNs = parseVotingPeriodNs(proposal.voting_config?.voting_period);
  const startNs = resolveTimestampNs(tally?.created_at ?? proposal.created_at);
  if (periodNs === null || startNs === null) return null;

  const endNs = startNs + periodNs;
  const endMs = Number(endNs / NS_PER_MS);
  if (!Number.isFinite(endMs)) return null;

  const date = new Date(endMs);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function guildProposalClosesLabel(
  proposal: Proposal,
  tally: ProposalTally | null,
  now: Date = new Date()
): { label: string | null; title: string | null; isExpired: boolean } {
  if (proposal.status !== 'active') {
    return { label: null, title: null, isExpired: false };
  }

  const deadline = guildProposalVotingDeadline(proposal, tally);
  if (!deadline) return { label: null, title: null, isExpired: false };

  const title = formatPostTimestamp(deadline.getTime());
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return { label: 'Voting closed', title, isExpired: true };
  }
  if (remainingMs < 60_000) {
    return { label: 'Closes soon', title, isExpired: false };
  }

  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 60) {
    return { label: `Closes in ${minutes}m`, title, isExpired: false };
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { label: `Closes in ${hours}h`, title, isExpired: false };
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return { label: `Closes in ${days}d`, title, isExpired: false };
  }

  return {
    label: `Closes ${new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      ...(deadline.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    }).format(deadline)}`,
    title,
    isExpired: false,
  };
}

function votesRequiredForQuorum(memberPool: number, quorumBps: number): number {
  if (memberPool <= 0) return 0;
  return Math.ceil((memberPool * quorumBps) / BPS_DENOMINATOR);
}

function meetsMajorityThreshold(
  yesVotes: number,
  totalVotes: number,
  majorityBps: number
): boolean {
  if (totalVotes <= 0) return false;
  return yesVotes * BPS_DENOMINATOR >= majorityBps * totalVotes;
}

function canStillReachMajority(
  yesVotes: number,
  totalVotes: number,
  remainingMembers: number,
  majorityBps: number
): boolean {
  const maxYes = yesVotes + remainingMembers;
  const maxTotal = totalVotes + remainingMembers;
  if (maxTotal <= 0) return false;
  return maxYes * BPS_DENOMINATOR >= majorityBps * maxTotal;
}

function activeProposalProgressLabel(input: {
  yesVotes: number;
  noVotes: number;
  totalVotes: number;
  memberPool: number;
  quorumVotesRequired: number;
  majorityBps: number;
}): string {
  const {
    yesVotes,
    noVotes,
    totalVotes,
    memberPool,
    quorumVotesRequired,
    majorityBps,
  } = input;
  const votesStillNeeded = Math.max(quorumVotesRequired - totalVotes, 0);
  const remainingMembers = Math.max(memberPool - totalVotes, 0);

  if (votesStillNeeded > 0) {
    return `${totalVotes}/${memberPool} · need ${votesStillNeeded} more`;
  }

  const meetsMajority = meetsMajorityThreshold(
    yesVotes,
    totalVotes,
    majorityBps
  );
  const canStillPass = canStillReachMajority(
    yesVotes,
    totalVotes,
    remainingMembers,
    majorityBps
  );

  if (!meetsMajority && canStillPass && remainingMembers === 1) {
    return `${yesVotes}–${noVotes} · 1 decides`;
  }

  if (!meetsMajority && canStillPass && remainingMembers > 1) {
    return `${yesVotes}–${noVotes} · ${remainingMembers} left`;
  }

  if (!meetsMajority && !canStillPass) {
    return `${yesVotes}–${noVotes} · not enough`;
  }

  if (meetsMajority) {
    return `${yesVotes}–${noVotes} · ready`;
  }

  return `${totalVotes}/${memberPool} · quorum met`;
}

/** Mirrors on-chain quorum + majority checks for compact proposal progress UI. */
export function guildProposalVoteProgress(
  proposal: Proposal,
  tally: ProposalTally | null,
  now: Date = new Date()
): GuildProposalVoteProgress {
  const yesVotes = Number(tally?.yes_votes) || 0;
  const totalVotes = Number(tally?.total_votes) || 0;
  const noVotes = Math.max(totalVotes - yesVotes, 0);
  const memberPool = Number(tally?.locked_member_count) || 0;
  const quorumBps = proposal.voting_config?.participation_quorum_bps ?? 5100;
  const majorityBps = proposal.voting_config?.majority_threshold_bps ?? 5001;
  const quorumVotesRequired = votesRequiredForQuorum(memberPool, quorumBps);
  const poolDenominator = Math.max(memberPool, 1);
  const supportPoolPercent = (yesVotes / poolDenominator) * 100;
  const opposePoolPercent = (noVotes / poolDenominator) * 100;
  const quorumMarkerPercent = Math.min(
    (quorumVotesRequired / poolDenominator) * 100,
    100
  );
  const closes = guildProposalClosesLabel(proposal, tally, now);
  const terminalLabel =
    proposal.status === 'executed' || proposal.status === 'executed_skipped'
      ? `${yesVotes}/${memberPool} supported · approved`
      : proposal.status === 'rejected'
        ? `${totalVotes}/${memberPool} voted · not passed`
        : proposal.status === 'cancelled'
          ? `${totalVotes}/${memberPool} voted · cancelled`
          : null;
  const label =
    memberPool <= 0
      ? ''
      : (terminalLabel ??
        activeProposalProgressLabel({
          yesVotes,
          noVotes,
          totalVotes,
          memberPool,
          quorumVotesRequired,
          majorityBps,
        }));

  const progressDetail = closes.isExpired
    ? `${label}${label ? ' · ' : ''}voting period ended`
    : label;

  return {
    yesVotes,
    noVotes,
    totalVotes,
    memberPool,
    quorumVotesRequired,
    supportPoolPercent,
    opposePoolPercent,
    quorumMarkerPercent,
    label: progressDetail,
    closesLabel: closes.label,
    closesTitle: closes.title,
    ariaLabel: `${yesVotes} supported, ${noVotes} opposed, out of ${memberPool} members at proposal time. ${progressDetail}${
      closes.label ? `. ${closes.label}` : ''
    }`,
    showProgress: memberPool > 0,
  };
}
