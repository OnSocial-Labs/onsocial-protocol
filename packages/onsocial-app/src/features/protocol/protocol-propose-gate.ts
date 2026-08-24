import type { ProtocolCreateKind } from '@/features/protocol/protocol-create';
import {
  daoRoleGroupMembers,
  daoRoleMemberThreshold,
  isEveryoneDaoRole,
} from '@/features/protocol/protocol-dao-role-kind';
import type { ProtocolPolicyActionId } from '@/features/protocol/protocol-policy';
import type {
  ProtocolDaoPolicy,
  ProtocolDaoRole,
} from '@/features/protocol/types';

export {
  daoRoleGroupMembers,
  daoRoleMemberThreshold,
  isEveryoneDaoRole,
} from '@/features/protocol/protocol-dao-role-kind';

type ProtocolCreatableKindLabel =
  | 'add_member_to_role'
  | 'remove_member_from_role'
  | 'vote'
  | 'transfer'
  | 'call';

const CREATE_KIND_POLICY_LABEL: Record<
  ProtocolCreateKind,
  ProtocolCreatableKindLabel
> = {
  join_self: 'add_member_to_role',
  add_member: 'add_member_to_role',
  leave_self: 'remove_member_from_role',
  remove_member: 'remove_member_from_role',
  signal: 'vote',
  transfer: 'transfer',
  fund_season_pool: 'call',
  withdraw_boost_infra: 'call',
  set_boost_infra_authority: 'call',
  transfer_ownership: 'call',
  contract_upgrade: 'call',
  contract_config: 'call',
  season_config: 'call',
};

const POLICY_ACTION_PERMISSION_LABEL: Record<ProtocolPolicyActionId, string> = {
  update_permissions: 'policy_add_or_update_role',
  update_parameters: 'policy_update_parameters',
  update_config: 'config',
  update_vote_policy: 'policy_update_default_vote_policy',
  add_role: 'policy_add_or_update_role',
  remove_role: 'policy_remove_role',
};

function normalizeAccountId(accountId: string | null | undefined): string {
  return accountId?.trim().toLowerCase() ?? '';
}

export function isProtocolDaoGroupMember(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string | null | undefined
): boolean {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) return false;
  return (policy?.roles ?? []).some((role) =>
    daoRoleGroupMembers(role).some(
      (member) => normalizeAccountId(member) === normalized
    )
  );
}

function roleCanAddProposal(
  role: ProtocolDaoRole,
  proposalPolicyLabel: string
): boolean {
  const permissions = role.permissions ?? [];
  return permissions.some(
    (permission) =>
      permission === '*:*' ||
      permission === '*:AddProposal' ||
      permission === `${proposalPolicyLabel}:AddProposal` ||
      permission === `${proposalPolicyLabel}:*`
  );
}

function roleCanAddAnyProposal(role: ProtocolDaoRole): boolean {
  return (role.permissions ?? []).some((permission) => {
    if (permission === '*:*' || permission === '*:AddProposal') return true;
    const sep = permission.lastIndexOf(':');
    if (sep <= 0) return false;
    const action = permission.slice(sep + 1);
    return action === 'AddProposal' || action === '*';
  });
}

function roleMatchesDelegatedUser(
  role: ProtocolDaoRole,
  accountId: string,
  delegatedWeight: string
): boolean {
  const normalizedAccount = normalizeAccountId(accountId);
  if (!normalizedAccount) return false;

  if (isEveryoneDaoRole(role)) return true;

  const group = daoRoleGroupMembers(role);
  if (group.length > 0) {
    return group.some(
      (member) => normalizeAccountId(member) === normalizedAccount
    );
  }

  const threshold = daoRoleMemberThreshold(role);
  if (threshold != null) {
    try {
      return BigInt(delegatedWeight || '0') >= BigInt(threshold);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * This DAO's `get_policy` — a role that can AddProposal matches via Everyone,
 * the viewer's Group, or Member weight. Not "any Group" (vote-only lists).
 */
export function viewerCanAddProposalOnPolicy(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string | null | undefined,
  delegatedWeight = '0'
): boolean {
  const proposer = accountId?.trim() ?? '';
  if (!proposer) return false;
  return (policy?.roles ?? []).some(
    (role) =>
      roleCanAddAnyProposal(role) &&
      roleMatchesDelegatedUser(role, proposer, delegatedWeight)
  );
}

/** Member-threshold role that can AddProposal — no invented default. */
export function getMemberProposeThreshold(
  policy: ProtocolDaoPolicy | null | undefined
): string | null {
  const roles = policy?.roles ?? [];
  const named = roles.find(
    (role) =>
      role.name === 'delegated_proposers' &&
      daoRoleMemberThreshold(role) != null
  );
  if (named) return daoRoleMemberThreshold(named);
  for (const role of roles) {
    const threshold = daoRoleMemberThreshold(role);
    if (threshold != null && roleCanAddAnyProposal(role)) return threshold;
  }
  return null;
}

/** A Member propose role plus a staking contract — token may not be SOCIAL. */
export function daoHasStakeProposePath(
  policy: ProtocolDaoPolicy | null | undefined,
  stakingContractId: string | null | undefined
): boolean {
  return Boolean(stakingContractId?.trim()) && getMemberProposeThreshold(policy) != null;
}

export type StakeProposeKind = 'none' | 'social' | 'foreign';

/**
 * SOCIAL stake UI only when this DAO's staking token is SOCIAL.
 * Any other (or unknown) token is foreign — block propose, no Stake sheet.
 */
export function resolveStakeProposeKind(opts: {
  hasMemberProposeRole: boolean;
  stakingContractId: string | null | undefined;
  stakeTokenId: string | null | undefined;
  socialTokenId: string;
  knownSocialStakingIds?: readonly string[];
}): StakeProposeKind {
  const staking = opts.stakingContractId?.trim() ?? '';
  if (!opts.hasMemberProposeRole || !staking) return 'none';

  const token = opts.stakeTokenId?.trim() ?? '';
  if (token) {
    return token.toLowerCase() === opts.socialTokenId.trim().toLowerCase()
      ? 'social'
      : 'foreign';
  }
  const known = opts.knownSocialStakingIds ?? [];
  if (
    known.some(
      (id) => id.trim().toLowerCase() === staking.toLowerCase()
    )
  ) {
    return 'social';
  }
  return 'foreign';
}

export function defaultForeignStakeTokenLabel(
  stakeTokenId: string | null | undefined
): string {
  return stakeTokenId?.trim() || "this DAO's token";
}

export function foreignStakeLockReason(tokenLabel: string): string {
  return `Need ${tokenLabel} stake`;
}

export function canProposeProtocolCreateKind(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string | null | undefined,
  delegatedWeight: string,
  kind: ProtocolCreateKind
): boolean {
  const proposer = accountId?.trim() ?? '';
  if (!proposer) return false;
  const label = CREATE_KIND_POLICY_LABEL[kind];
  return (policy?.roles ?? []).some(
    (role) =>
      roleMatchesDelegatedUser(role, proposer, delegatedWeight) &&
      roleCanAddProposal(role, label)
  );
}

/**
 * Permission path without weight — Group membership, or any Member-threshold
 * role that grants this kind (staking can unlock Member roles).
 * Use to hide dead kinds; keep stake-short kinds visible.
 */
export function viewerHasCreateKindPermission(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string | null | undefined,
  kind: ProtocolCreateKind
): boolean {
  const proposer = normalizeAccountId(accountId);
  if (!proposer) return false;
  const label = CREATE_KIND_POLICY_LABEL[kind];
  return (policy?.roles ?? []).some((role) => {
    if (!roleCanAddProposal(role, label)) return false;
    if (isEveryoneDaoRole(role)) return true;
    if (daoRoleGroupMembers(role).length > 0) {
      return daoRoleGroupMembers(role).some(
        (member) => normalizeAccountId(member) === proposer
      );
    }
    return daoRoleMemberThreshold(role) != null;
  });
}

export function canProposeProtocolPolicyAction(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string | null | undefined,
  delegatedWeight: string,
  actionId: ProtocolPolicyActionId
): boolean {
  const proposer = accountId?.trim() ?? '';
  if (!proposer) return false;
  const label = POLICY_ACTION_PERMISSION_LABEL[actionId];
  return (policy?.roles ?? []).some(
    (role) =>
      roleMatchesDelegatedUser(role, proposer, delegatedWeight) &&
      roleCanAddProposal(role, label)
  );
}

/** Same as create-kind permission, for Settings action pickers. */
export function viewerHasPolicyActionPermission(
  policy: ProtocolDaoPolicy | null | undefined,
  accountId: string | null | undefined,
  actionId: ProtocolPolicyActionId
): boolean {
  const proposer = normalizeAccountId(accountId);
  if (!proposer) return false;
  const label = POLICY_ACTION_PERMISSION_LABEL[actionId];
  return (policy?.roles ?? []).some((role) => {
    if (!roleCanAddProposal(role, label)) return false;
    if (isEveryoneDaoRole(role)) return true;
    if (daoRoleGroupMembers(role).length > 0) {
      return daoRoleGroupMembers(role).some(
        (member) => normalizeAccountId(member) === proposer
      );
    }
    return daoRoleMemberThreshold(role) != null;
  });
}

export function getProtocolCreateKindBlockReason(
  kind: ProtocolCreateKind
): string {
  switch (kind) {
    case 'join_self':
    case 'add_member':
      return 'Needs membership permission.';
    case 'leave_self':
    case 'remove_member':
      return 'Needs remove permission.';
    case 'signal':
      return 'Needs signal permission.';
    case 'transfer':
      return 'Needs transfer permission.';
    case 'fund_season_pool':
    case 'withdraw_boost_infra':
    case 'set_boost_infra_authority':
    case 'transfer_ownership':
    case 'contract_upgrade':
    case 'contract_config':
    case 'season_config':
      return 'Needs call permission.';
    default: {
      const exhaustive: never = kind;
      return `Cannot propose ${exhaustive}.`;
    }
  }
}

function getProposePathLockReason(opts: {
  hasStakeProposePath?: boolean;
  foreignStakeTokenLabel?: string | null;
  remainingLabel: string | null;
}): string {
  if (opts.foreignStakeTokenLabel) {
    return foreignStakeLockReason(opts.foreignStakeTokenLabel);
  }
  if (opts.hasStakeProposePath === false) {
    return 'Not on a proposing role';
  }
  return opts.remainingLabel
    ? `Need ${opts.remainingLabel} SOCIAL`
    : 'Stake more SOCIAL';
}

/** One-line lock copy for the propose kind drawer. */
export function getProtocolCreateKindLockReason(opts: {
  kind: ProtocolCreateKind;
  accountId: string | null;
  canProposeAny: boolean;
  isGroupMember: boolean;
  remainingLabel: string | null;
  canProposeKind: boolean;
  hasStakeProposePath?: boolean;
  foreignStakeTokenLabel?: string | null;
}): string | null {
  if (!opts.accountId) return 'Connect a wallet';
  if (!opts.canProposeAny && !opts.isGroupMember) {
    return getProposePathLockReason(opts);
  }
  if (!opts.canProposeKind) {
    return getProtocolCreateKindBlockReason(opts.kind);
  }
  return null;
}

export function getProtocolPolicyActionBlockReason(
  actionId: ProtocolPolicyActionId
): string {
  switch (actionId) {
    case 'update_permissions':
    case 'add_role':
      return 'Needs role-change permission.';
    case 'update_parameters':
      return 'Needs parameter permission.';
    case 'update_config':
      return 'Needs config permission.';
    case 'update_vote_policy':
      return 'Needs vote-policy permission.';
    case 'remove_role':
      return 'Needs remove-role permission.';
    default: {
      const exhaustive: never = actionId;
      return `Cannot propose ${exhaustive}.`;
    }
  }
}

/** One-line lock copy for the settings action drawer. */
export function getProtocolPolicyActionLockReason(opts: {
  actionId: ProtocolPolicyActionId;
  accountId: string | null;
  canProposeAny: boolean;
  isGroupMember: boolean;
  remainingLabel: string | null;
  canProposeAction: boolean;
  hasStakeProposePath?: boolean;
  foreignStakeTokenLabel?: string | null;
}): string | null {
  if (!opts.accountId) return 'Connect a wallet';
  if (!opts.canProposeAny && !opts.isGroupMember) {
    return getProposePathLockReason(opts);
  }
  if (!opts.canProposeAction) {
    return getProtocolPolicyActionBlockReason(opts.actionId);
  }
  return null;
}
