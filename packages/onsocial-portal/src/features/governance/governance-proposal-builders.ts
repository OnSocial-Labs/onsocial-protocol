import type {
  GovernanceDaoPolicy,
  GovernanceDaoRole,
  GovernanceDaoVotePolicy,
} from '@/features/governance/types';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export function findDaoRole(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string
): GovernanceDaoRole | null {
  const normalizedRoleId = roleId.trim();
  if (!normalizedRoleId) {
    return null;
  }

  return (
    policy?.roles?.find((role) => role.name?.trim() === normalizedRoleId) ?? null
  );
}

export function isDaoRoleMember(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string,
  memberId: string
): boolean {
  const role = findDaoRole(policy, roleId);
  const member = normalizeAccountId(memberId);

  if (!role?.kind || !member) {
    return false;
  }

  if (role.kind.Group) {
    return role.kind.Group.some(
      (account) => normalizeAccountId(account) === member
    );
  }

  // Threshold Member roles (e.g. delegated_proposers) are not Group membership.
  // Join/leave proposals only apply to explicit Group roles on-chain.
  return false;
}

export function resolveCreatableProposalKinds(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string,
  memberId: string
): CreatableDaoProposalKind[] {
  if (!roleId.trim() || !memberId.trim()) {
    return [];
  }

  const isMember = isDaoRoleMember(policy, roleId, memberId);
  const kinds: CreatableDaoProposalKind[] = [];

  if (!isMember) {
    kinds.push('join_role');
  }

  if (isMember) {
    kinds.push('leave_role');
  }

  return kinds;
}

export function getProposalKindBlockReason(
  kind: CreatableDaoProposalKind,
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string,
  memberId: string
): string {
  const normalizedMember = memberId.trim();
  const normalizedRole = roleId.trim();

  if (!normalizedMember || !normalizedRole) {
    return '';
  }

  const isMember = isDaoRoleMember(policy, roleId, memberId);

  if (kind === 'leave_role' && !isMember) {
    return `${normalizedMember} is not in ${normalizedRole}.`;
  }

  if (kind === 'join_role' && isMember) {
    return `${normalizedMember} is already in ${normalizedRole}.`;
  }

  if (kind === 'idea') {
    return '';
  }

  return '';
}

export type CreatableDaoProposalKind = 'join_role' | 'leave_role' | 'idea';

const CREATABLE_KIND_POLICY_LABEL: Record<CreatableDaoProposalKind, string> = {
  join_role: 'add_member_to_role',
  leave_role: 'remove_member_from_role',
  idea: 'vote',
};

function roleMatchesDelegatedUser(
  role: GovernanceDaoRole,
  accountId: string,
  delegatedWeight: string
): boolean {
  const normalizedAccount = normalizeAccountId(accountId);
  if (!normalizedAccount) {
    return false;
  }

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
  role: GovernanceDaoRole,
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

/** Mirrors Sputnik DAO add_proposal permission checks for join/leave kinds. */
export function canProposeDaoKind(
  policy: GovernanceDaoPolicy | null | undefined,
  accountId: string,
  delegatedWeight: string,
  kind: CreatableDaoProposalKind
): boolean {
  const proposalPolicyLabel = CREATABLE_KIND_POLICY_LABEL[kind];

  return (policy?.roles ?? []).some(
    (role) =>
      roleMatchesDelegatedUser(role, accountId, delegatedWeight) &&
      roleCanAddProposal(role, proposalPolicyLabel)
  );
}

export function getDaoKindPermissionBlockReason(
  kind: CreatableDaoProposalKind
): string {
  if (kind === 'join_role') {
    return 'Your wallet cannot propose join requests on the DAO yet. Membership proposal permission is missing from DAO policy.';
  }

  if (kind === 'leave_role') {
    return 'Your wallet cannot propose leave requests on the DAO yet. Membership proposal permission is missing from DAO policy.';
  }

  return 'Your wallet cannot propose ideas on the DAO yet. Idea proposal permission is missing from DAO policy.';
}

/** Listed on a DAO role Group (e.g. guardians). */
export function isDaoGroupMember(
  policy: GovernanceDaoPolicy | null | undefined,
  accountId: string
): boolean {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) {
    return false;
  }

  return (policy?.roles ?? []).some((role) =>
    role.kind?.Group?.some(
      (member) => normalizeAccountId(member) === normalized
    )
  );
}

const POLICY_ACTION_PERMISSION_LABEL: Record<DaoPolicyActionId, string> = {
  update_permissions: 'policy_add_or_update_role',
  update_parameters: 'policy_update_parameters',
  add_role: 'policy_add_or_update_role',
  remove_role: 'policy_remove_role',
};

export function canProposePolicyAction(
  policy: GovernanceDaoPolicy | null | undefined,
  accountId: string,
  delegatedWeight: string,
  actionId: DaoPolicyActionId
): boolean {
  const policyLabel = POLICY_ACTION_PERMISSION_LABEL[actionId];

  return (policy?.roles ?? []).some(
    (role) =>
      roleMatchesDelegatedUser(role, accountId, delegatedWeight) &&
      roleCanAddProposal(role, policyLabel)
  );
}

export function canProposePolicyChange(
  policy: GovernanceDaoPolicy | null | undefined,
  accountId: string,
  delegatedWeight: string
): boolean {
  const policyLabels = [
    'policy_add_or_update_role',
    'policy_update_parameters',
    'policy_remove_role',
    'policy',
  ];

  return policyLabels.some((label) =>
    (policy?.roles ?? []).some(
      (role) =>
        roleMatchesDelegatedUser(role, accountId, delegatedWeight) &&
        roleCanAddProposal(role, label)
    )
  );
}

export const DELEGATED_PROPOSERS_ROLE_ID = 'delegated_proposers';

/** On-chain role id → portal label. */
export const DAO_ROLE_DISPLAY_NAMES: Record<string, string> = {
  [DELEGATED_PROPOSERS_ROLE_ID]: 'Delegated proposers',
  guardians: 'Guardians',
};

export function isDelegatedProposersRoleId(roleId: string): boolean {
  return roleId.trim() === DELEGATED_PROPOSERS_ROLE_ID;
}

export type DaoAddRoleAccessMode = 'full_access' | 'custom';

export const DAO_ADD_ROLE_ACCESS_OPTIONS: Array<{
  id: DaoAddRoleAccessMode;
  label: string;
  hint: string;
}> = [
  {
    id: 'full_access',
    label: 'Full access',
    hint: 'Council role with *:* — copies guardians membership',
  },
  {
    id: 'custom',
    label: 'Choose permissions',
    hint: 'Public proposer — copies SOCIAL gate and vote rules',
  },
];

export function findFullAccessDaoRole(
  policy: GovernanceDaoPolicy | null | undefined
): GovernanceDaoRole | null {
  const guardians = findDaoRole(policy, GUARDIANS_ROLE_ID);
  if (guardians && isFullAccessDaoRole(guardians)) {
    return guardians;
  }

  return policy?.roles?.find(isFullAccessDaoRole) ?? null;
}

export function resolveAddRoleSourceRole(
  policy: GovernanceDaoPolicy | null | undefined,
  accessMode: DaoAddRoleAccessMode
): GovernanceDaoRole | null {
  if (accessMode === 'full_access') {
    return findFullAccessDaoRole(policy);
  }

  return findDelegatedProposersRole(policy);
}

export function getAddRoleAccessBlockReason(
  policy: GovernanceDaoPolicy | null | undefined,
  accessMode: DaoAddRoleAccessMode
): string {
  if (resolveAddRoleSourceRole(policy, accessMode)) {
    return '';
  }

  if (accessMode === 'full_access') {
    return 'No council role in policy to copy full access from.';
  }

  return 'No public proposer role in policy to copy the SOCIAL gate from.';
}

export function findDelegatedProposersRole(
  policy: GovernanceDaoPolicy | null | undefined
): GovernanceDaoRole | null {
  const byName = findDaoRole(policy, DELEGATED_PROPOSERS_ROLE_ID);
  if (byName) {
    return byName;
  }

  return (
    policy?.roles?.find(
      (role) =>
        role.kind?.Member != null &&
        role.kind.Member !== '' &&
        (role.permissions ?? []).includes('call:AddProposal')
    ) ?? null
  );
}

export function formatDaoRoleDisplayName(roleId: string): string {
  const normalized = roleId.trim();
  if (!normalized) {
    return '';
  }

  return DAO_ROLE_DISPLAY_NAMES[normalized] ?? normalized;
}

export function formatDaoRoleSelectLabel(roleId: string): string {
  const normalized = roleId.trim();
  const displayName = formatDaoRoleDisplayName(normalized);

  if (!normalized || displayName === normalized) {
    return displayName;
  }

  return `${displayName} (${normalized})`;
}

export const DAO_IDEA_PROPOSAL_PERMISSION = 'vote:AddProposal';

/** Partner + join + leave — actionable public proposals. */
export const DAO_DELEGATED_ACTION_PERMISSIONS_PRESET = [
  'call:AddProposal',
  'add_member_to_role:AddProposal',
  'remove_member_from_role:AddProposal',
] as const;

/** Actions + on-chain ideas (Sputnik Vote — signaling only). */
export const DAO_FULL_PUBLIC_PERMISSIONS_PRESET = [
  ...DAO_DELEGATED_ACTION_PERMISSIONS_PRESET,
  DAO_IDEA_PROPOSAL_PERMISSION,
] as const;

/** @deprecated Use DAO_DELEGATED_ACTION_PERMISSIONS_PRESET */
export const DAO_OPEN_MEMBERSHIP_PERMISSIONS_PRESET =
  DAO_DELEGATED_ACTION_PERMISSIONS_PRESET;

export type DaoPermissionPresetId = 'all_public' | 'actions_only' | 'custom';

export function daoPermissionSetsEqual(
  left: string[] | undefined,
  right: string[] | readonly string[] | undefined
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  const current = new Set(a);
  if (current.size !== b.length) {
    return false;
  }

  return b.every((permission) => current.has(permission));
}

function permissionSetEquals(
  permissions: string[] | undefined,
  preset: readonly string[]
): boolean {
  return daoPermissionSetsEqual(permissions, preset);
}

export function matchDaoPermissionPreset(
  permissions: string[] | undefined
): DaoPermissionPresetId {
  if (permissionSetEquals(permissions, DAO_FULL_PUBLIC_PERMISSIONS_PRESET)) {
    return 'all_public';
  }

  if (permissionSetEquals(permissions, DAO_DELEGATED_ACTION_PERMISSIONS_PRESET)) {
    return 'actions_only';
  }

  return 'custom';
}

export function formatDaoPermissionPresetLabel(
  presetId: DaoPermissionPresetId
): string {
  switch (presetId) {
    case 'all_public':
      return 'All public';
    case 'actions_only':
      return 'Actions only';
    default:
      return 'Custom';
  }
}

export function roleHasWildcardPermissions(role: GovernanceDaoRole): boolean {
  return (role.permissions ?? []).includes('*:*');
}

export const GUARDIANS_ROLE_ID = 'guardians';

export function isFullAccessDaoRole(role: GovernanceDaoRole): boolean {
  return roleHasWildcardPermissions(role);
}

export function getFullAccessDaoRoleIds(
  roles: GovernanceDaoRole[] | undefined
): string[] {
  const names =
    roles
      ?.filter(isFullAccessDaoRole)
      .map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];

  return [...new Set(names)];
}

export function getRemoveDaoPolicyRoleBlockReason(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string
): string {
  const normalizedRoleId = roleId.trim();
  if (!normalizedRoleId) {
    return 'Choose a role to remove.';
  }

  const role = findDaoRole(policy, normalizedRoleId);
  if (!role) {
    return `Role ${normalizedRoleId} is not in DAO policy.`;
  }

  if (!isFullAccessDaoRole(role)) {
    return '';
  }

  if (getFullAccessDaoRoleIds(policy?.roles).length <= 1) {
    return 'Cannot remove the only full-access role. Add another council role with full access (*:*) first.';
  }

  return '';
}

export function canRemoveDaoPolicyRole(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string
): boolean {
  return getRemoveDaoPolicyRoleBlockReason(policy, roleId) === '';
}

export function getRemovableDaoPolicyRoleOptions(
  policy: GovernanceDaoPolicy | null | undefined
): string[] {
  return getDaoPolicyRoleOptions(policy).filter((roleId) =>
    canRemoveDaoPolicyRole(policy, roleId)
  );
}

export function isEditableDaoPolicyRole(role: GovernanceDaoRole): boolean {
  const name = role.name?.trim();
  if (!name) {
    return false;
  }

  return !roleHasWildcardPermissions(role);
}

export function getEditableDaoPolicyRoleOptions(
  roles: GovernanceDaoRole[] | undefined
): string[] {
  const names =
    roles
      ?.filter(isEditableDaoPolicyRole)
      .map((role) => role.name!.trim()) ?? [];

  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function resolveDefaultEditablePolicyRole(
  roles: GovernanceDaoRole[] | undefined
): string {
  const delegatedRole = findDelegatedProposersRole({ roles });
  const delegatedRoleId = delegatedRole?.name?.trim();
  if (delegatedRoleId) {
    return delegatedRoleId;
  }

  return getEditableDaoPolicyRoleOptions(roles)[0] ?? '';
}

export const DAO_PUBLIC_PERMISSION_OPTIONS = [
  { id: 'call:AddProposal', label: 'Function call' },
  { id: 'add_member_to_role:AddProposal', label: 'Join' },
  { id: 'remove_member_from_role:AddProposal', label: 'Leave' },
  { id: DAO_IDEA_PROPOSAL_PERMISSION, label: 'Signaling' },
] as const;

/** Meta-permissions — can propose role or parameter policy changes. */
export const DAO_GOVERNANCE_PERMISSION_OPTIONS = [
  { id: 'policy_add_or_update_role:AddProposal', label: 'Role changes' },
  { id: 'policy_update_parameters:AddProposal', label: 'Parameter changes' },
] as const;

/** @deprecated Use DAO_GOVERNANCE_PERMISSION_OPTIONS */
export const DAO_ADVANCED_PERMISSION_OPTIONS = DAO_GOVERNANCE_PERMISSION_OPTIONS;

export const DAO_GOVERNANCE_PERMISSION_IDS = new Set<string>(
  DAO_GOVERNANCE_PERMISSION_OPTIONS.map((option) => option.id)
);

export const DAO_EDITABLE_PERMISSION_OPTIONS = [
  ...DAO_PUBLIC_PERMISSION_OPTIONS,
  ...DAO_GOVERNANCE_PERMISSION_OPTIONS,
] as const;

const DAO_EDITABLE_PERMISSION_IDS = new Set<string>(
  DAO_EDITABLE_PERMISSION_OPTIONS.map((option) => option.id)
);

export function isDaoGroupRole(role: GovernanceDaoRole): boolean {
  return (role.kind?.Group?.length ?? 0) > 0;
}

function preserveNonEditableRolePermissions(
  role: GovernanceDaoRole,
  nextEditablePermissions: string[]
): string[] {
  const preserved = (role.permissions ?? []).filter(
    (permission) => !DAO_EDITABLE_PERMISSION_IDS.has(permission)
  );

  return [...new Set([...preserved, ...nextEditablePermissions])];
}

export function filterEditablePermissions(
  permissions: string[] | undefined
): string[] {
  return (permissions ?? []).filter((permission) =>
    DAO_EDITABLE_PERMISSION_OPTIONS.some((option) => option.id === permission)
  );
}

function permissionOnChainLabel(permissionId: string, label: string): string {
  if (permissionId === DAO_IDEA_PROPOSAL_PERMISSION) {
    return 'Signaling (Vote — text only, no execution)';
  }

  if (permissionId === 'call:AddProposal') {
    return 'Function call (FunctionCall)';
  }

  if (permissionId === 'add_member_to_role:AddProposal') {
    return 'Join (AddMemberToRole)';
  }

  if (permissionId === 'remove_member_from_role:AddProposal') {
    return 'Leave (RemoveMemberFromRole)';
  }

  if (permissionId === 'policy_add_or_update_role:AddProposal') {
    return 'Role changes (ChangePolicyAddOrUpdateRole)';
  }

  if (permissionId === 'policy_update_parameters:AddProposal') {
    return 'Parameter changes (ChangePolicyUpdateParameters)';
  }

  return label;
}

export function summarizeDaoPermissionsOnChain(
  permissions: string[] | undefined
): string {
  const labels = (permissions ?? [])
    .map((permission) => {
      const option = DAO_EDITABLE_PERMISSION_OPTIONS.find(
        (entry) => entry.id === permission
      );
      if (!option) {
        return null;
      }

      return permissionOnChainLabel(option.id, option.label);
    })
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    return '';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export interface DaoPolicyActionHintContext {
  addRoleAccessMode?: DaoAddRoleAccessMode;
  addRolePermissions?: string[];
  newRoleName?: string | null;
  socialThresholdLabel?: string;
  permissionsRoleId?: string;
  targetRoleId?: string;
  /** Permissions currently on-chain for the role being edited. */
  onChainPermissions?: string[];
  selectedPermissions?: string[];
  permissionsChanged?: boolean;
}

export function rolePermissionsChanged(
  role: GovernanceDaoRole | null | undefined,
  nextPermissions: string[]
): boolean {
  const current = new Set(filterEditablePermissions(role?.permissions));
  const next = new Set(nextPermissions);

  if (current.size !== next.size) {
    return true;
  }

  return [...next].some((permission) => !current.has(permission));
}

export type DaoProposalKind =
  | {
      AddMemberToRole: {
        member_id: string;
        role: string;
      };
    }
  | {
      RemoveMemberFromRole: {
        member_id: string;
        role: string;
      };
    }
  | {
      ChangePolicyAddOrUpdateRole: {
        role: {
          name: string;
          kind: { Group: string[] } | { Member: string };
          permissions: string[];
          vote_policy: Record<string, GovernanceDaoVotePolicy>;
        };
      };
    }
  | {
      ChangePolicyUpdateParameters: {
        parameters: {
          proposal_bond?: string;
          proposal_period?: string;
        };
      };
    }
  | {
      ChangePolicyRemoveRole: {
        role: string;
      };
    }
  | {
      Vote: null;
    };

export interface DaoProposalPayload {
  proposal: {
    description: string;
    kind: DaoProposalKind;
  };
}

function serializeDaoRoleKind(
  role: GovernanceDaoRole
): { Group: string[] } | { Member: string } {
  if (role.kind?.Group?.length) {
    return { Group: role.kind.Group };
  }

  if (role.kind?.Member != null && role.kind.Member !== '') {
    return { Member: role.kind.Member };
  }

  throw new Error(`Role ${role.name ?? 'unknown'} has no supported kind.`);
}

export type DaoPolicyActionId =
  | 'update_permissions'
  | 'update_parameters'
  | 'add_role'
  | 'remove_role';

export const DAO_POLICY_ACTION_OPTIONS: Array<{
  id: DaoPolicyActionId;
  label: string;
  outcome: string;
}> = [
  {
    id: 'update_permissions',
    label: 'Permissions',
    outcome: 'Change which proposal kinds a public role can submit.',
  },
  {
    id: 'update_parameters',
    label: 'Parameters',
    outcome: 'Change proposal bond or voting period for future proposals.',
  },
  {
    id: 'add_role',
    label: 'Add role',
    outcome: 'Name a new role — council (full access) or public (pick permissions).',
  },
  {
    id: 'remove_role',
    label: 'Remove role',
    outcome: 'Remove a role. Council roles need another full-access role first.',
  },
];

export function getDaoPolicyActionHint(
  actionId: DaoPolicyActionId,
  context?: DaoPolicyActionHintContext
): string {
  if (actionId === 'add_role') {
    const roleName = context?.newRoleName?.trim();
    const roleLabel = roleName ? `\`${roleName}\`` : 'the new role';

    if (context?.addRoleAccessMode === 'full_access') {
      return `On-chain: ChangePolicyAddOrUpdateRole adds ${roleLabel} as a council Group with *:* — policy, treasury, upgrades, and all public proposal kinds. Copies guardians members and vote rules.`;
    }

    if (context?.addRoleAccessMode === 'custom') {
      const threshold = context.socialThresholdLabel
        ? `≥${context.socialThresholdLabel} delegated SOCIAL`
        : 'the SOCIAL gate';
      const summary = summarizeDaoPermissionsOnChain(context.addRolePermissions);

      if (!summary) {
        return `On-chain: ChangePolicyAddOrUpdateRole adds a Member role (${threshold}). Select permissions to set allowed proposal kinds.`;
      }

      return `On-chain: ChangePolicyAddOrUpdateRole adds ${roleLabel} as a Member role (${threshold}) allowed to propose ${summary}.`;
    }
  }

  if (actionId === 'update_permissions' && context?.permissionsRoleId) {
    const onChainSummary = summarizeDaoPermissionsOnChain(
      context.onChainPermissions
    );

    if (!context.selectedPermissions?.length) {
      if (onChainSummary) {
        return `On-chain: \`${context.permissionsRoleId}\` currently allows ${onChainSummary}. Toggle permissions to change the on-chain policy.`;
      }

      return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\`. Select permissions to set allowed proposal kinds.`;
    }

    const summary = summarizeDaoPermissionsOnChain(context.selectedPermissions);

    if (context.permissionsChanged) {
      return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\` to allow ${summary}.`;
    }

    if (onChainSummary) {
      return `On-chain: \`${context.permissionsRoleId}\` currently allows ${onChainSummary}. Toggle permissions to change the on-chain policy.`;
    }

    return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\` to allow ${summary}.`;
  }

  if (actionId === 'update_parameters') {
    return 'On-chain: ChangePolicyUpdateParameters updates proposal bond and voting period for future proposals.';
  }

  if (actionId === 'remove_role') {
    const targetRoleId = context?.targetRoleId?.trim();
    if (targetRoleId) {
      return `On-chain: ChangePolicyRemoveRole removes \`${targetRoleId}\` from the DAO policy.`;
    }

    return 'On-chain: ChangePolicyRemoveRole removes a role from the DAO policy.';
  }

  return (
    DAO_POLICY_ACTION_OPTIONS.find((option) => option.id === actionId)?.outcome ??
    ''
  );
}

export function getDaoPolicyRoleOptions(
  policy: GovernanceDaoPolicy | null | undefined
): string[] {
  const names =
    policy?.roles
      ?.map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];

  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function normalizeDaoRoleNameInput(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized || !/^[a-z][a-z0-9_]*$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function resolveAddRolePermissions(
  sourceRole: GovernanceDaoRole,
  selectedPermissions: string[] | undefined
): string[] {
  if (roleHasWildcardPermissions(sourceRole)) {
    return sourceRole.permissions ?? [];
  }

  if (!selectedPermissions?.length) {
    throw new Error('Select at least one permission.');
  }

  return [...new Set(selectedPermissions)];
}

export function buildDaoPolicyAddRolePayload({
  newRoleName,
  sourceRole,
  permissions,
  description,
}: {
  newRoleName: string;
  sourceRole: GovernanceDaoRole;
  permissions?: string[];
  description?: string;
}): DaoProposalPayload {
  const normalizedNewRoleName = normalizeDaoRoleNameInput(newRoleName);
  if (!normalizedNewRoleName) {
    throw new Error('Enter a valid role name (lowercase letters, numbers, underscores).');
  }

  const resolvedPermissions = resolveAddRolePermissions(sourceRole, permissions);
  const accessLabel = roleHasWildcardPermissions(sourceRole)
    ? 'full access'
    : 'public permissions';

  return {
    proposal: {
      description:
        description?.trim() ||
        `Add ${normalizedNewRoleName} role (${accessLabel}).`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name: normalizedNewRoleName,
            kind: serializeDaoRoleKind(sourceRole),
            permissions: resolvedPermissions,
            vote_policy: sourceRole.vote_policy ?? {},
          },
        },
      },
    },
  };
}

export function buildDaoPolicyActionPayload({
  actionId,
  policy,
  description,
  proposalBondYocto,
  proposalPeriodNs,
  newRoleName,
  addRoleAccessMode,
  targetRoleId,
  permissionsRoleId,
  permissions,
}: {
  actionId: DaoPolicyActionId;
  policy: GovernanceDaoPolicy | null | undefined;
  description?: string;
  proposalBondYocto?: string;
  proposalPeriodNs?: string;
  newRoleName?: string;
  addRoleAccessMode?: DaoAddRoleAccessMode;
  targetRoleId?: string;
  permissionsRoleId?: string;
  permissions?: string[];
}): DaoProposalPayload {
  switch (actionId) {
    case 'update_permissions': {
      const role = findDaoRole(policy, permissionsRoleId ?? '');
      if (!role) {
        throw new Error('Choose a role to update.');
      }

      if (roleHasWildcardPermissions(role)) {
        throw new Error('Full-access roles cannot be edited here.');
      }

      if (!permissions?.length) {
        throw new Error('Select at least one permission.');
      }

      if (!rolePermissionsChanged(role, permissions)) {
        throw new Error('Change permissions before submitting.');
      }

      return buildDaoPolicyRoleUpdatePayload({
        role,
        permissions,
        description,
      });
    }
    case 'update_parameters':
      return buildDaoPolicyParametersUpdatePayload({
        proposalBondYocto,
        proposalPeriodNs,
        description,
      });
    case 'add_role': {
      const normalizedNewRoleName = normalizeDaoRoleNameInput(newRoleName ?? '');
      if (!normalizedNewRoleName) {
        throw new Error('Enter a valid new role name.');
      }

      if (findDaoRole(policy, normalizedNewRoleName)) {
        throw new Error(`Role ${normalizedNewRoleName} already exists.`);
      }

      const accessMode = addRoleAccessMode ?? 'custom';
      const accessBlockReason = getAddRoleAccessBlockReason(policy, accessMode);
      if (accessBlockReason) {
        throw new Error(accessBlockReason);
      }

      const sourceRole = resolveAddRoleSourceRole(policy, accessMode);
      if (!sourceRole) {
        throw new Error('Could not resolve role structure for this access mode.');
      }

      if (accessMode === 'custom' && !permissions?.length) {
        throw new Error('Select at least one permission.');
      }

      return buildDaoPolicyAddRolePayload({
        newRoleName: normalizedNewRoleName,
        sourceRole,
        permissions: accessMode === 'full_access' ? undefined : permissions,
        description,
      });
    }
    case 'remove_role': {
      const normalizedTargetRoleId = targetRoleId?.trim();
      const removeBlockReason = getRemoveDaoPolicyRoleBlockReason(
        policy,
        normalizedTargetRoleId ?? ''
      );
      if (removeBlockReason) {
        throw new Error(removeBlockReason);
      }

      return buildDaoPolicyRemoveRolePayload({
        roleId: normalizedTargetRoleId!,
        description,
        policy,
      });
    }
    default: {
      const exhaustive: never = actionId;
      throw new Error(`Unsupported policy action: ${exhaustive}`);
    }
  }
}

export function buildDaoPolicyRemoveRolePayload({
  roleId,
  description,
  policy,
}: {
  roleId: string;
  description?: string;
  policy?: GovernanceDaoPolicy | null;
}): DaoProposalPayload {
  const normalizedRoleId = roleId.trim();
  const removeBlockReason = getRemoveDaoPolicyRoleBlockReason(
    policy,
    normalizedRoleId
  );
  if (removeBlockReason) {
    throw new Error(removeBlockReason);
  }

  return {
    proposal: {
      description:
        description?.trim() ||
        `Remove ${normalizedRoleId} from the OnSocial DAO policy.`,
      kind: {
        ChangePolicyRemoveRole: {
          role: normalizedRoleId,
        },
      },
    },
  };
}

export function buildDaoPolicyParametersUpdatePayload({
  proposalBondYocto,
  proposalPeriodNs,
  description,
}: {
  proposalBondYocto?: string;
  proposalPeriodNs?: string;
  description?: string;
}): DaoProposalPayload {
  const parameters: {
    proposal_bond?: string;
    proposal_period?: string;
  } = {};

  if (proposalBondYocto) {
    parameters.proposal_bond = proposalBondYocto;
  }

  if (proposalPeriodNs) {
    parameters.proposal_period = proposalPeriodNs;
  }

  if (!parameters.proposal_bond && !parameters.proposal_period) {
    throw new Error('Set at least one parameter to update.');
  }

  return {
    proposal: {
      description:
        description?.trim() ||
        'Update OnSocial DAO proposal bond and voting period.',
      kind: {
        ChangePolicyUpdateParameters: {
          parameters,
        },
      },
    },
  };
}

export function buildDaoPolicyRoleUpdatePayload({
  role,
  permissions,
  description,
}: {
  role: GovernanceDaoRole;
  permissions: string[];
  description?: string;
}): DaoProposalPayload {
  const roleName = role.name?.trim();
  if (!roleName) {
    throw new Error('Role name is required.');
  }

  if (permissions.length === 0) {
    throw new Error('Select at least one permission.');
  }

  const mergedPermissions = preserveNonEditableRolePermissions(role, permissions);

  return {
    proposal: {
      description:
        description?.trim() ||
        `Update ${roleName} permissions on the OnSocial DAO.`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name: roleName,
            kind: serializeDaoRoleKind(role),
            permissions: mergedPermissions,
            vote_policy: role.vote_policy ?? {},
          },
        },
      },
    },
  };
}

export const CREATABLE_DAO_IDEA_PROPOSAL_OPTION = {
  kind: 'idea' as const,
  label: 'Idea',
  description: 'Raise an on-chain signaling proposal (no execution).',
};

export const CREATABLE_DAO_MEMBERSHIP_PROPOSAL_OPTIONS = [
  {
    kind: 'join_role' as const,
    label: 'Join role',
    description: 'Add a wallet to a DAO role.',
  },
  {
    kind: 'leave_role' as const,
    label: 'Leave role',
    description: 'Remove a wallet from a DAO role.',
  },
];

/** Includes idea — enable on Create when idea UI ships. */
export const CREATABLE_DAO_PROPOSAL_OPTIONS = [
  ...CREATABLE_DAO_MEMBERSHIP_PROPOSAL_OPTIONS,
  CREATABLE_DAO_IDEA_PROPOSAL_OPTION,
];

export function buildDaoIdeaProposalPayload({
  description,
}: {
  description?: string;
}): DaoProposalPayload {
  const proposalDescription = description?.trim();
  if (!proposalDescription) {
    throw new Error('Idea description is required.');
  }

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        Vote: null,
      },
    },
  };
}

export function getCreatableDaoRoleOptions(
  roles: GovernanceDaoRole[] | undefined
): string[] {
  const names =
    roles
      ?.filter(isDaoGroupRole)
      .map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name))
      .filter((name) => !isDelegatedProposersRoleId(name)) ?? [];

  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function buildDaoMemberProposalPayload({
  kind,
  memberId,
  roleId,
  description,
}: {
  kind: Exclude<CreatableDaoProposalKind, 'idea'>;
  memberId: string;
  roleId: string;
  description?: string;
}): DaoProposalPayload {
  const normalizedMember = memberId.trim();
  const normalizedRole = roleId.trim();

  if (!normalizedMember) {
    throw new Error('Member account is required.');
  }
  if (!normalizedRole) {
    throw new Error('Role is required.');
  }

  const defaultDescription =
    kind === 'join_role'
      ? `Add ${normalizedMember} to the ${normalizedRole} role on the OnSocial DAO.`
      : `Remove ${normalizedMember} from the ${normalizedRole} role on the OnSocial DAO.`;

  const proposalDescription = description?.trim() || defaultDescription;

  if (kind === 'join_role') {
    return {
      proposal: {
        description: proposalDescription,
        kind: {
          AddMemberToRole: {
            member_id: normalizedMember,
            role: normalizedRole,
          },
        },
      },
    };
  }

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        RemoveMemberFromRole: {
          member_id: normalizedMember,
          role: normalizedRole,
        },
      },
    },
  };
}

export function buildProtocolProposalAppId(proposalId: number): string {
  return `protocol-proposal-${proposalId}`;
}

export function getDefaultDaoAccountId(): string {
  return GOVERNANCE_DAO_ACCOUNT;
}
