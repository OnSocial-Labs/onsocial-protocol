import type { ProtocolCreateKind } from '@/features/protocol/protocol-create';
import type { ProtocolPolicyActionId } from '@/features/protocol/protocol-policy';
import type {
  ProtocolDaoPolicy,
  ProtocolDaoRole,
} from '@/features/protocol/types';

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
    role.kind?.Group?.some(
      (member) => normalizeAccountId(member) === normalized
    )
  );
}

function roleMatchesDelegatedUser(
  role: ProtocolDaoRole,
  accountId: string,
  delegatedWeight: string
): boolean {
  const normalizedAccount = normalizeAccountId(accountId);
  if (!normalizedAccount) return false;

  if (role.kind?.Group?.length) {
    return role.kind.Group.some(
      (member) => normalizeAccountId(member) === normalizedAccount
    );
  }

  if (role.kind?.Member != null && role.kind.Member !== '') {
    try {
      return BigInt(delegatedWeight || '0') >= BigInt(role.kind.Member);
    } catch {
      return false;
    }
  }

  return false;
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

/** One-line lock copy for the propose kind drawer. */
export function getProtocolCreateKindLockReason(opts: {
  kind: ProtocolCreateKind;
  accountId: string | null;
  canProposeAny: boolean;
  isGroupMember: boolean;
  remainingLabel: string | null;
  canProposeKind: boolean;
}): string | null {
  if (!opts.accountId) return 'Connect a wallet';
  if (!opts.canProposeAny && !opts.isGroupMember) {
    return opts.remainingLabel
      ? `Need ${opts.remainingLabel} SOCIAL`
      : 'Stake more SOCIAL';
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
      return 'Role-change proposals are not allowed for your roles.';
    case 'update_parameters':
      return 'Parameter proposals are not allowed for your roles.';
    case 'update_config':
      return 'Config proposals are not allowed for your roles.';
    case 'update_vote_policy':
      return 'Vote-policy proposals are not allowed for your roles.';
    case 'remove_role':
      return 'Remove-role proposals are not allowed for your roles.';
    default: {
      const exhaustive: never = actionId;
      return `Cannot propose ${exhaustive}.`;
    }
  }
}
