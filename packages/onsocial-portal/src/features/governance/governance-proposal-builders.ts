import type {
  GovernanceDaoPolicy,
  GovernanceDaoRole,
  GovernanceDaoVotePolicy,
} from '@/features/governance/types';
import {
  type GovernanceDaoBoard,
  buildGovernancePathWithBoard,
} from '@/features/governance/governance-dao-board';
import {
  formatSeasonConfigSummary,
  formatSocialSpendActionRoutingSummary,
  getDaoContractConfigOperation,
  seasonConfigDraftToInput,
  validateSeasonConfigDraft,
  validateSocialSpendActionRoutingBps,
  type DaoContractConfigOperationId,
  type SocialSpendActionRoutingDraft,
  type SocialSpendSeasonConfigDraft,
} from '@/lib/dao-contract-config-operations';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/portal-config';
import {
  BOOST_CONTRACT,
  isProposerThresholdWithinBounds,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  SOCIAL_SPEND_CONTRACT,
  TOKEN_CONTRACT,
  yoctoToNear,
  yoctoToSocial,
} from '@/lib/near-rpc';

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
    policy?.roles?.find((role) => role.name?.trim() === normalizedRoleId) ??
    null
  );
}

export function getDaoGroupRoleMemberOptions(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string,
  options?: { excludeAccountId?: string }
): string[] {
  const role = findDaoRole(policy, roleId);
  const exclude = normalizeAccountId(options?.excludeAccountId ?? '');

  if (!role?.kind?.Group?.length) {
    return [];
  }

  const members = role.kind.Group.map((member) => member.trim())
    .filter((member): member is string => Boolean(member))
    .filter((member) => !exclude || normalizeAccountId(member) !== exclude);

  return [...new Set(members)].sort((left, right) => left.localeCompare(right));
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

export function resolveCreatableProposalKindsForProposer(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string,
  proposerAccountId: string,
  delegatedWeight: string,
  membershipSubjectId?: string | null,
  options?: { pinJoinRole?: boolean; pinLeaveRole?: boolean }
): CreatableDaoProposalKind[] {
  const proposer = proposerAccountId.trim();
  const subject = (membershipSubjectId ?? proposerAccountId).trim();
  const pinJoinRole = options?.pinJoinRole ?? false;
  const pinLeaveRole = options?.pinLeaveRole ?? false;
  const kinds: CreatableDaoProposalKind[] = [];

  if (!proposer) {
    return kinds;
  }

  if (roleId.trim()) {
    if (
      canProposeDaoKind(policy, proposer, delegatedWeight, 'join_role') &&
      (pinJoinRole || !subject || !isDaoRoleMember(policy, roleId, subject))
    ) {
      kinds.push('join_role');
    }

    if (
      canProposeDaoKind(policy, proposer, delegatedWeight, 'leave_role') &&
      (pinLeaveRole || !subject || isDaoRoleMember(policy, roleId, subject))
    ) {
      kinds.push('leave_role');
    }
  }

  if (canProposeDaoKind(policy, proposer, delegatedWeight, 'idea')) {
    kinds.push('idea');
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

  if (kind === 'transfer') {
    return '';
  }

  return '';
}

export type CreatableDaoProposalKind =
  | 'join_role'
  | 'leave_role'
  | 'idea'
  | 'transfer'
  | 'transfer_ownership'
  | 'contract_upgrade'
  | 'contract_config'
  | 'fund_season_pool'
  | 'withdraw_boost_infra'
  | 'set_boost_infra_authority';

export type CreatableDaoProposalAction =
  | 'join_self'
  | 'add_member'
  | 'leave_self'
  | 'remove_member'
  | 'idea'
  | 'transfer'
  | 'transfer_ownership'
  | 'contract_upgrade'
  | 'contract_config'
  | 'fund_season_pool'
  | 'withdraw_boost_infra'
  | 'set_boost_infra_authority';

export const SOCIAL_SPEND_FUNCTION_CALL_GAS = 100_000_000_000_000;
export const SOCIAL_SPEND_FUNCTION_CALL_DEPOSIT = '1';
export const BOOST_WITHDRAW_INFRA_FUNCTION_CALL_GAS = 150_000_000_000_000;
export const BOOST_FUNCTION_CALL_DEPOSIT = '1';
/** Verified gas for DAO `update_contract_from_hash` proposals (see HASH_UPGRADE_RUNBOOK). */
export const CONTRACT_UPGRADE_FUNCTION_CALL_GAS = 250_000_000_000_000;

const NEAR_PUBLISHED_CODE_HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

const DAO_HASH_UPGRADABLE_CONTRACT_IDS = new Set(
  [
    REWARDS_CONTRACT,
    BOOST_CONTRACT,
    SCARCES_CONTRACT,
    SOCIAL_SPEND_CONTRACT,
  ].map((contractId) => contractId.toLowerCase())
);

export function isDaoHashUpgradableContractId(contractId: string): boolean {
  const normalized = contractId.trim().toLowerCase();
  return DAO_HASH_UPGRADABLE_CONTRACT_IDS.has(normalized);
}

export function normalizePublishedCodeHash(input: string): string | null {
  const trimmed = input.trim();
  if (!NEAR_PUBLISHED_CODE_HASH_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function formatPublishedCodeHashPreview(codeHash: string): string {
  const normalized = codeHash.trim();
  if (normalized.length <= 18) {
    return normalized;
  }

  return `${normalized.slice(0, 10)}…${normalized.slice(-8)}`;
}

export function proposalActionToKind(
  action: CreatableDaoProposalAction
): CreatableDaoProposalKind {
  switch (action) {
    case 'join_self':
    case 'add_member':
      return 'join_role';
    case 'leave_self':
    case 'remove_member':
      return 'leave_role';
    case 'idea':
      return 'idea';
    case 'transfer':
      return 'transfer';
    case 'transfer_ownership':
      return 'transfer_ownership';
    case 'contract_upgrade':
      return 'contract_upgrade';
    case 'contract_config':
      return 'contract_config';
    case 'fund_season_pool':
      return 'fund_season_pool';
    case 'withdraw_boost_infra':
      return 'withdraw_boost_infra';
    case 'set_boost_infra_authority':
      return 'set_boost_infra_authority';
  }
}

export function isProposalActionNomination(
  action: CreatableDaoProposalAction
): boolean {
  return action === 'add_member' || action === 'remove_member';
}

export function resolveCreatableProposalActionsForProposer(
  policy: GovernanceDaoPolicy | null | undefined,
  roleId: string,
  proposerAccountId: string,
  delegatedWeight: string
): CreatableDaoProposalAction[] {
  const proposer = proposerAccountId.trim();
  const actions: CreatableDaoProposalAction[] = [];

  if (!proposer) {
    return actions;
  }

  const normalizedRoleId = roleId.trim();
  const proposerInRole =
    normalizedRoleId.length > 0 &&
    isDaoRoleMember(policy, normalizedRoleId, proposer);

  if (
    normalizedRoleId &&
    canProposeDaoKind(policy, proposer, delegatedWeight, 'join_role')
  ) {
    if (!proposerInRole) {
      actions.push('join_self');
    }

    // Nominating someone else does not require the proposer to be in the role.
    actions.push('add_member');
  }

  if (
    normalizedRoleId &&
    canProposeDaoKind(policy, proposer, delegatedWeight, 'leave_role')
  ) {
    if (proposerInRole) {
      actions.push('leave_self');
    }

    actions.push('remove_member');
  }

  if (canProposeDaoKind(policy, proposer, delegatedWeight, 'idea')) {
    actions.push('idea');
  }

  if (canProposeDaoKind(policy, proposer, delegatedWeight, 'transfer')) {
    actions.push('transfer');
  }

  if (
    canProposeDaoKind(policy, proposer, delegatedWeight, 'transfer_ownership')
  ) {
    actions.push('transfer_ownership');
  }

  if (
    canProposeDaoKind(policy, proposer, delegatedWeight, 'contract_upgrade')
  ) {
    actions.push('contract_upgrade');
  }

  if (canProposeDaoKind(policy, proposer, delegatedWeight, 'contract_config')) {
    actions.push('contract_config');
  }

  if (
    canProposeDaoKind(policy, proposer, delegatedWeight, 'fund_season_pool')
  ) {
    actions.push('fund_season_pool');
  }

  if (
    canProposeDaoKind(policy, proposer, delegatedWeight, 'withdraw_boost_infra')
  ) {
    actions.push('withdraw_boost_infra');
  }

  if (
    canProposeDaoKind(
      policy,
      proposer,
      delegatedWeight,
      'set_boost_infra_authority'
    )
  ) {
    actions.push('set_boost_infra_authority');
  }

  return actions;
}

export function getProposalActionSubmitLabel(
  action: CreatableDaoProposalAction
): string {
  switch (action) {
    case 'join_self':
      return 'Propose join';
    case 'add_member':
      return 'Add member';
    case 'leave_self':
      return 'Propose leave';
    case 'remove_member':
      return 'Remove member';
    case 'idea':
      return 'Propose signal';
    case 'transfer':
      return 'Propose transfer';
    case 'transfer_ownership':
      return 'Propose ownership transfer';
    case 'contract_upgrade':
      return 'Propose contract upgrade';
    case 'contract_config':
      return 'Propose contract config';
    case 'fund_season_pool':
      return 'Propose season funding';
    case 'withdraw_boost_infra':
      return 'Propose boost infra withdraw';
    case 'set_boost_infra_authority':
      return 'Propose boost withdraw delegate';
  }
}

const CREATABLE_KIND_POLICY_LABEL: Record<CreatableDaoProposalKind, string> = {
  join_role: 'add_member_to_role',
  leave_role: 'remove_member_from_role',
  idea: 'vote',
  transfer: 'transfer',
  transfer_ownership: 'call',
  contract_upgrade: 'call',
  contract_config: 'call',
  fund_season_pool: 'call',
  withdraw_boost_infra: 'call',
  set_boost_infra_authority: 'call',
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
    return 'You cannot propose join requests on the DAO yet. Membership proposal permission is missing from DAO policy.';
  }

  if (kind === 'leave_role') {
    return 'You cannot propose leave requests on the DAO yet. Membership proposal permission is missing from DAO policy.';
  }

  if (kind === 'idea') {
    return 'You cannot propose Signals on the DAO yet. Signal proposal permission is missing from DAO policy.';
  }

  if (kind === 'transfer') {
    return 'You cannot propose transfers on the DAO yet. Transfer proposal permission is missing from DAO policy.';
  }

  if (kind === 'transfer_ownership') {
    return 'You cannot propose contract ownership transfers on the DAO yet. Call proposal permission is missing from DAO policy.';
  }

  if (kind === 'contract_upgrade') {
    return 'You cannot propose contract upgrades on the DAO yet. Call proposal permission is missing from DAO policy.';
  }

  if (kind === 'contract_config') {
    return 'You cannot propose contract configuration changes on the DAO yet. Call proposal permission is missing from DAO policy.';
  }

  if (kind === 'fund_season_pool') {
    return 'You cannot propose rally pool funding on the DAO yet. Call proposal permission is missing from DAO policy.';
  }

  if (kind === 'withdraw_boost_infra' || kind === 'set_boost_infra_authority') {
    return 'You cannot propose boost infra actions on the DAO yet. Call proposal permission is missing from DAO policy.';
  }

  return 'You cannot propose this action on the DAO yet.';
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
  update_vote_policy: 'policy_update_default_vote_policy',
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
    'policy_update_default_vote_policy',
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

/** On-chain role id → portal label (aligned across treasury + governance DAOs). */
export const DAO_ROLE_DISPLAY_NAMES: Record<string, string> = {
  [DELEGATED_PROPOSERS_ROLE_ID]: 'Delegated proposers',
  guardians: 'Guardians',
  council: 'Council',
  all: 'Everyone',
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

/** User-facing label for Vote-kind (text-only) DAO proposals. */
export const DAO_SIGNAL_PROPOSAL_LABEL = 'Signal';

export const DAO_SIGNAL_PROPOSAL_MENU_DESCRIPTION =
  'Text-only — rules, strategy, ops, or direction. Nothing executes automatically.';

export const DAO_SIGNAL_PROPOSAL_PLACEHOLDER = 'What should the DAO consider?';

export const DAO_SIGNAL_PROPOSAL_PERMISSION_HINT =
  'Signal (Vote — text only, no execution)';

export const DAO_TRANSFER_PROPOSAL_PERMISSION = 'transfer:AddProposal';

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

/** Wildcard *:AddProposal — every proposal kind the picker can express. */
export const DAO_PROPOSE_ALL_PERMISSIONS_PRESET = [
  ...DAO_FULL_PUBLIC_PERMISSIONS_PRESET,
  'policy_add_or_update_role:AddProposal',
  'policy_update_parameters:AddProposal',
  DAO_TRANSFER_PROPOSAL_PERMISSION,
] as const;

/** @deprecated Use DAO_DELEGATED_ACTION_PERMISSIONS_PRESET */
export const DAO_OPEN_MEMBERSHIP_PERMISSIONS_PRESET =
  DAO_DELEGATED_ACTION_PERMISSIONS_PRESET;

export type DaoPermissionPresetId =
  | 'all_public'
  | 'actions_only'
  | 'propose_all'
  | 'custom';

export const DAO_WILDCARD_ADD_PROPOSAL_PERMISSION = '*:AddProposal';

export function roleHasWildcardAddProposal(
  permissions: string[] | undefined
): boolean {
  return (permissions ?? []).includes(DAO_WILDCARD_ADD_PROPOSAL_PERMISSION);
}

/** Map on-chain permissions to the granular ids shown in the permission picker. */
export function readPermissionPickerPermissions(
  permissions: string[] | undefined
): string[] {
  const editable = filterEditablePermissions(permissions);
  if (editable.length > 0) {
    return editable;
  }

  if (roleHasWildcardAddProposal(permissions)) {
    return [...DAO_PROPOSE_ALL_PERMISSIONS_PRESET];
  }

  return [];
}

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
  const raw = permissions ?? [];
  if (
    filterEditablePermissions(raw).length === 0 &&
    roleHasWildcardAddProposal(raw)
  ) {
    return 'propose_all';
  }

  const pickerPermissions = readPermissionPickerPermissions(raw);

  if (
    permissionSetEquals(pickerPermissions, DAO_FULL_PUBLIC_PERMISSIONS_PRESET)
  ) {
    return 'all_public';
  }

  if (
    permissionSetEquals(
      pickerPermissions,
      DAO_DELEGATED_ACTION_PERMISSIONS_PRESET
    )
  ) {
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
    case 'propose_all':
      return 'Propose all';
    default:
      return 'Custom';
  }
}

export function roleHasWildcardPermissions(role: GovernanceDaoRole): boolean {
  return (role.permissions ?? []).includes('*:*');
}

export const GUARDIANS_ROLE_ID = 'guardians';

export const COUNCIL_VOTE_ROLE_IDS = ['guardians', 'council'] as const;

export function resolveCouncilVotePoolSize(
  policy: GovernanceDaoPolicy | null | undefined
): number | null {
  for (const roleId of COUNCIL_VOTE_ROLE_IDS) {
    const role = findDaoRole(policy, roleId);
    const group = role?.kind?.Group;
    if (Array.isArray(group) && group.length > 0) {
      return group.length;
    }
  }

  return null;
}

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

  if (roleHasWildcardPermissions(role)) {
    return false;
  }

  if (isDaoCouncilRole(role)) {
    return false;
  }

  return true;
}

export function getEditableDaoPolicyRoleOptions(
  roles: GovernanceDaoRole[] | undefined
): string[] {
  return sortDaoPolicyRolesForDisplay(roles)
    .filter(isEditableDaoPolicyRole)
    .map((role) => role.name!.trim())
    .filter(Boolean);
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
  { id: DAO_IDEA_PROPOSAL_PERMISSION, label: DAO_SIGNAL_PROPOSAL_LABEL },
  { id: DAO_TRANSFER_PROPOSAL_PERMISSION, label: 'Transfer' },
] as const;

/** Meta-permissions — can propose role or parameter policy changes. */
export const DAO_GOVERNANCE_PERMISSION_OPTIONS = [
  { id: 'policy_add_or_update_role:AddProposal', label: 'Role changes' },
  { id: 'policy_update_parameters:AddProposal', label: 'Parameter changes' },
] as const;

/** @deprecated Use DAO_GOVERNANCE_PERMISSION_OPTIONS */
export const DAO_ADVANCED_PERMISSION_OPTIONS =
  DAO_GOVERNANCE_PERMISSION_OPTIONS;

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

export function isDaoCouncilRole(role: GovernanceDaoRole): boolean {
  const name = role.name?.trim();
  if (name && (COUNCIL_VOTE_ROLE_IDS as readonly string[]).includes(name)) {
    return true;
  }

  if (roleHasWildcardPermissions(role) && isDaoGroupRole(role)) {
    return true;
  }

  if (!isDaoGroupRole(role)) {
    return false;
  }

  return (role.permissions ?? []).some((permission) =>
    rolePermissionIsCouncilAction(permission)
  );
}

function rolePermissionIsCouncilAction(permission: string): boolean {
  if (permission === '*:*') {
    return true;
  }

  return (
    permission === '*:AddProposal' ||
    permission.endsWith(':VoteApprove') ||
    permission.endsWith(':VoteReject') ||
    permission.endsWith(':VoteRemove') ||
    permission.endsWith(':Finalize')
  );
}

export type DaoRoleKind = 'council' | 'public' | 'gated';

export function resolveDaoRoleKind(role: GovernanceDaoRole): DaoRoleKind {
  if (isDaoCouncilRole(role) || roleHasWildcardPermissions(role)) {
    return 'council';
  }

  if (role.kind?.Member) {
    return 'gated';
  }

  return 'public';
}

export type DaoRolePermissionChip = {
  key: string;
  label: string;
  tone: 'gold' | 'blue' | 'default';
};

function resolveRolePermissionChipLabel(
  role: GovernanceDaoRole,
  permission: string
): { key: string; label: string; tone: DaoRolePermissionChip['tone'] } | null {
  if (permission === '*:*') {
    return { key: 'full-access', label: 'Full access', tone: 'gold' };
  }

  const editableLabel = DAO_EDITABLE_PERMISSION_OPTIONS.find(
    (option) => option.id === permission
  )?.label;
  if (editableLabel) {
    return {
      key: permission,
      label: editableLabel,
      tone: DAO_GOVERNANCE_PERMISSION_IDS.has(permission) ? 'blue' : 'default',
    };
  }

  if (permission === '*:AddProposal') {
    return { key: 'propose-all', label: 'Propose all', tone: 'default' };
  }

  if (
    permission.endsWith(':VoteApprove') ||
    permission.endsWith(':VoteReject') ||
    permission.endsWith(':VoteRemove')
  ) {
    return { key: 'vote', label: 'Vote', tone: 'gold' };
  }

  if (permission.endsWith(':Finalize')) {
    return { key: 'finalize', label: 'Finalize', tone: 'gold' };
  }

  if (permission.endsWith(':AddProposal')) {
    return {
      key: permission,
      label: 'Propose',
      tone: roleHasWildcardPermissions(role) ? 'gold' : 'default',
    };
  }

  return null;
}

export function buildDaoRolePermissionChips(
  role: GovernanceDaoRole
): DaoRolePermissionChip[] {
  if (roleHasWildcardPermissions(role) || isDaoCouncilRole(role)) {
    return [{ key: 'full-access', label: 'Full access', tone: 'gold' }];
  }

  const chips: DaoRolePermissionChip[] = [];
  const seen = new Set<string>();

  for (const permission of role.permissions ?? []) {
    const chip = resolveRolePermissionChipLabel(role, permission);
    if (!chip || seen.has(chip.key)) {
      continue;
    }

    seen.add(chip.key);
    chips.push(chip);
  }

  return chips;
}

export function compareDaoPolicyRolesForDisplay(
  left: GovernanceDaoRole,
  right: GovernanceDaoRole
): number {
  const kindOrder: Record<DaoRoleKind, number> = {
    council: 0,
    gated: 1,
    public: 2,
  };
  const kindDelta =
    kindOrder[resolveDaoRoleKind(left)] - kindOrder[resolveDaoRoleKind(right)];
  if (kindDelta !== 0) {
    return kindDelta;
  }

  const leftName = left.name?.trim() ?? '';
  const rightName = right.name?.trim() ?? '';
  const displayDelta = formatDaoRoleDisplayName(leftName).localeCompare(
    formatDaoRoleDisplayName(rightName)
  );
  if (displayDelta !== 0) {
    return displayDelta;
  }

  return leftName.localeCompare(rightName);
}

export function sortDaoPolicyRolesForDisplay(
  roles: GovernanceDaoRole[] | undefined
): GovernanceDaoRole[] {
  return [...(roles ?? [])].sort(compareDaoPolicyRolesForDisplay);
}

function preserveNonEditableRolePermissions(
  role: GovernanceDaoRole,
  nextEditablePermissions: string[]
): string[] {
  const preserved = (role.permissions ?? []).filter(
    (permission) =>
      !DAO_EDITABLE_PERMISSION_IDS.has(permission) &&
      permission !== DAO_WILDCARD_ADD_PROPOSAL_PERMISSION
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
    return DAO_SIGNAL_PROPOSAL_PERMISSION_HINT;
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

  if (permissionId === DAO_TRANSFER_PROPOSAL_PERMISSION) {
    return 'Transfer (Transfer)';
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
  memberThresholdChanged?: boolean;
  currentVoteThreshold?: [number, number] | null;
  nextVoteThreshold?: [number, number] | null;
  currentVoteQuorum?: string;
  nextVoteQuorum?: string;
  councilVotePoolSize?: number | null;
  votePolicyChanged?: boolean;
}

export function rolePermissionsChanged(
  role: GovernanceDaoRole | null | undefined,
  nextPermissions: string[]
): boolean {
  const current = new Set(readPermissionPickerPermissions(role?.permissions));
  const next = new Set(nextPermissions);

  if (current.size !== next.size) {
    return true;
  }

  return [...next].some((permission) => !current.has(permission));
}

export function isDaoMemberWeightRole(role: GovernanceDaoRole): boolean {
  return role.kind?.Member != null && role.kind.Member !== '';
}

export function readDaoRoleMemberThreshold(
  role: GovernanceDaoRole | null | undefined
): string | null {
  const member = role?.kind?.Member;
  if (member == null || member === '') {
    return null;
  }

  return member;
}

export function roleMemberThresholdChanged(
  role: GovernanceDaoRole | null | undefined,
  nextThresholdSmallest: string | null | undefined
): boolean {
  const current = readDaoRoleMemberThreshold(role);
  if (!current || !nextThresholdSmallest) {
    return false;
  }

  return current !== nextThresholdSmallest.trim();
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
      ChangePolicyUpdateDefaultVotePolicy: {
        vote_policy: GovernanceDaoVotePolicy;
      };
    }
  | {
      ChangePolicyRemoveRole: {
        role: string;
      };
    }
  | {
      Vote: null;
    }
  | {
      Transfer: {
        token_id: string;
        receiver_id: string;
        amount: string;
      };
    }
  | {
      FunctionCall: {
        receiver_id: string;
        actions: Array<{
          method_name: string;
          args: string;
          deposit: string;
          gas: number;
        }>;
      };
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
  | 'update_vote_policy'
  | 'add_role'
  | 'remove_role';

export const DAO_VOTE_THRESHOLD_PRESETS = [
  {
    id: 'pct_25',
    nameLabel: 'Low threshold',
    percentLabel: '25%',
    threshold: [25, 100] as [number, number],
  },
  {
    id: 'pct_50',
    nameLabel: 'Simple majority',
    percentLabel: '50%',
    threshold: [50, 100] as [number, number],
  },
  {
    id: 'pct_75',
    nameLabel: 'Supermajority',
    percentLabel: '75%',
    threshold: [75, 100] as [number, number],
  },
  {
    id: 'pct_100',
    nameLabel: 'Unanimous',
    percentLabel: '100%',
    threshold: [100, 100] as [number, number],
  },
] as const;

export type DaoVoteThresholdPresetId =
  (typeof DAO_VOTE_THRESHOLD_PRESETS)[number]['id'];

export function formatVoteThresholdFraction(
  threshold: [number, number]
): string {
  return `${threshold[0]}/${threshold[1]}`;
}

export function formatVoteThresholdOptionLabel(
  preset: (typeof DAO_VOTE_THRESHOLD_PRESETS)[number],
  threshold: [number, number] = preset.threshold
): string {
  return `${preset.nameLabel} · ${preset.percentLabel} · ${formatVoteThresholdFraction(threshold)}`;
}

export function votePolicyThresholdsEqual(
  left: [number, number] | null | undefined,
  right: [number, number] | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  return left[0] * right[1] === right[0] * left[1];
}

export function resolveVoteThresholdPresetId(
  threshold: [number, number] | null | undefined
): DaoVoteThresholdPresetId | null {
  if (!threshold) {
    return null;
  }

  return (
    DAO_VOTE_THRESHOLD_PRESETS.find((preset) =>
      votePolicyThresholdsEqual(threshold, preset.threshold)
    )?.id ?? null
  );
}

export function resolveDaoVoteThresholdPreset(
  presetId: DaoVoteThresholdPresetId | null | undefined
): (typeof DAO_VOTE_THRESHOLD_PRESETS)[number] | null {
  if (!presetId) {
    return null;
  }

  return (
    DAO_VOTE_THRESHOLD_PRESETS.find((preset) => preset.id === presetId) ?? null
  );
}

export function readDefaultVotePolicyThreshold(
  policy: GovernanceDaoVotePolicy | null | undefined
): [number, number] | null {
  const threshold = policy?.threshold;
  if (!Array.isArray(threshold) || threshold.length !== 2) {
    return null;
  }

  const [numerator, denominator] = threshold;
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    numerator <= 0 ||
    denominator <= 0 ||
    numerator > denominator
  ) {
    return null;
  }

  return [numerator, denominator];
}

export function formatDefaultVotePolicyLabel(
  threshold: [number, number] | null | undefined
): string {
  if (!threshold) {
    return 'Unknown';
  }

  const matchedPreset = resolveDaoVoteThresholdPreset(
    resolveVoteThresholdPresetId(threshold)
  );
  const fraction = formatVoteThresholdFraction(threshold);

  if (matchedPreset) {
    return formatVoteThresholdOptionLabel(matchedPreset, threshold);
  }

  return fraction;
}

export function defaultVotePolicyThresholdsEqual(
  left: [number, number] | null | undefined,
  right: [number, number] | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  return left[0] === right[0] && left[1] === right[1];
}

export function readDefaultVotePolicyQuorum(
  policy: GovernanceDaoVotePolicy | null | undefined
): string {
  const quorum = policy?.quorum?.trim();
  if (!quorum || !/^\d+$/.test(quorum)) {
    return '0';
  }

  return quorum;
}

export function computeRoleWeightApprovalFloor(
  threshold: [number, number],
  councilSize: number
): number {
  const [numerator, denominator] = threshold;
  if (!denominator || councilSize <= 0) {
    return 0;
  }

  return Math.min(
    Math.floor((numerator * councilSize) / denominator) + 1,
    councilSize
  );
}

export function isVoteQuorumAllowed(
  quorum: string,
  councilSize: number | null
): boolean {
  if (quorum === '0') {
    return true;
  }

  if (councilSize == null || councilSize <= 0) {
    return false;
  }

  const numericQuorum = Number(quorum);
  return (
    Number.isInteger(numericQuorum) &&
    numericQuorum >= 1 &&
    numericQuorum <= councilSize
  );
}

export interface DaoVoteQuorumOption {
  quorum: string;
  nameLabel: string;
}

export type VoteQuorumRiskLevel = 'none' | 'caution' | 'high';

export interface VoteQuorumRisk {
  level: VoteQuorumRiskLevel;
  message: string | null;
}

export function resolveVoteQuorumRisk(
  quorum: string,
  councilSize: number | null
): VoteQuorumRisk {
  if (councilSize == null || councilSize <= 0) {
    return { level: 'none', message: null };
  }

  const numericQuorum = Number(quorum);
  if (!Number.isInteger(numericQuorum) || numericQuorum <= 0) {
    return { level: 'none', message: null };
  }

  if (numericQuorum > councilSize) {
    return {
      level: 'high',
      message:
        'Minimum approvals already exceed council size. Lower this while enough members can still vote—or nothing may pass.',
    };
  }

  if (numericQuorum === councilSize && councilSize > 1) {
    return {
      level: 'high',
      message:
        'Lower this before a council member leaves—otherwise you may not be able to change it later.',
    };
  }

  if (councilSize >= 3 && numericQuorum === councilSize - 1) {
    return {
      level: 'caution',
      message:
        'Lower this before a member leaves—a smaller council may not be able to pass the vote to change it.',
    };
  }

  if (councilSize <= 2 && numericQuorum > 0) {
    return {
      level: 'caution',
      message:
        'Add more council members first, or lower this before anyone leaves—you may not be able to change it later.',
    };
  }

  return { level: 'none', message: null };
}

export function buildVoteQuorumNameLabel(
  quorum: number,
  councilSize: number | null
): string {
  if (quorum === 0) {
    return 'None';
  }

  if (councilSize != null && quorum === councilSize) {
    return 'All council';
  }

  if (quorum === 1) {
    return 'At least 1 approval';
  }

  return `At least ${quorum} approvals`;
}

export function buildDaoQuorumPresetOptions(
  councilSize: number | null,
  threshold: [number, number] | null = null,
  ensureQuorum?: string
): DaoVoteQuorumOption[] {
  if (councilSize == null || councilSize <= 0) {
    return [{ quorum: '0', nameLabel: 'None' }];
  }

  const thresholdFloor =
    threshold != null
      ? computeRoleWeightApprovalFloor(threshold, councilSize)
      : 1;

  const options: DaoVoteQuorumOption[] = [{ quorum: '0', nameLabel: 'None' }];

  for (let quorum = 1; quorum <= councilSize; quorum += 1) {
    if (quorum < thresholdFloor) {
      continue;
    }

    options.push({
      quorum: String(quorum),
      nameLabel: buildVoteQuorumNameLabel(quorum, councilSize),
    });
  }

  const normalizedEnsureQuorum = ensureQuorum?.trim();
  if (
    normalizedEnsureQuorum &&
    /^\d+$/.test(normalizedEnsureQuorum) &&
    !options.some((option) => option.quorum === normalizedEnsureQuorum)
  ) {
    const numericQuorum = Number(normalizedEnsureQuorum);
    if (numericQuorum > councilSize) {
      options.push({
        quorum: normalizedEnsureQuorum,
        nameLabel: `Out of date · ${normalizedEnsureQuorum}`,
      });
    } else if (numericQuorum > 0) {
      options.push({
        quorum: normalizedEnsureQuorum,
        nameLabel: buildVoteQuorumNameLabel(numericQuorum, councilSize),
      });
    }
  }

  return options.sort(
    (left, right) => Number(left.quorum) - Number(right.quorum)
  );
}

export function resolveSelectableVoteQuorum(
  quorum: string | null | undefined,
  councilSize: number | null,
  threshold: [number, number] | null = null
): string {
  const normalized =
    quorum?.trim() && /^\d+$/.test(quorum.trim()) ? quorum.trim() : '0';
  const options = buildDaoQuorumPresetOptions(
    councilSize,
    threshold,
    normalized
  );

  if (options.some((option) => option.quorum === normalized)) {
    return normalized;
  }

  return '0';
}

export function formatVoteQuorumOptionLabel(
  option: DaoVoteQuorumOption
): string {
  return `${option.nameLabel} · ${option.quorum}`;
}

export function formatDefaultVoteQuorumLabel(
  quorum: string,
  councilSize: number | null,
  threshold: [number, number] | null = null
): string {
  const option = buildDaoQuorumPresetOptions(
    councilSize,
    threshold,
    quorum
  ).find((candidate) => candidate.quorum === quorum);

  if (option) {
    return formatVoteQuorumOptionLabel(option);
  }

  return `Custom · ${quorum}`;
}

export function votePolicyRulesChanged({
  currentThreshold,
  nextThreshold,
  currentQuorum,
  nextQuorum,
}: {
  currentThreshold: [number, number] | null | undefined;
  nextThreshold: [number, number] | null | undefined;
  currentQuorum: string;
  nextQuorum: string;
}): boolean {
  const thresholdChanged =
    nextThreshold != null &&
    !defaultVotePolicyThresholdsEqual(currentThreshold, nextThreshold);
  const quorumChanged = nextQuorum !== currentQuorum;

  return thresholdChanged || quorumChanged;
}

export function parseVoteThresholdInputs(
  numeratorInput: string,
  denominatorInput: string
): [number, number] | null {
  const numerator = Number(numeratorInput.trim());
  const denominator = Number(denominatorInput.trim());

  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    numerator <= 0 ||
    denominator <= 0 ||
    numerator > denominator
  ) {
    return null;
  }

  return [numerator, denominator];
}

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
    id: 'update_vote_policy',
    label: 'Vote policy',
    outcome:
      'Change the default approval threshold and minimum approve floor for future proposals.',
  },
  {
    id: 'add_role',
    label: 'Add role',
    outcome:
      'Name a new role — council (full access) or public (pick permissions).',
  },
  {
    id: 'remove_role',
    label: 'Remove role',
    outcome:
      'Remove a role. Council roles need another full-access role first.',
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
      const summary = summarizeDaoPermissionsOnChain(
        context.addRolePermissions
      );

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
      if (context.memberThresholdChanged && context.socialThresholdLabel) {
        return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\` proposer threshold to ≥${context.socialThresholdLabel} delegated SOCIAL${summary ? ` and permissions to allow ${summary}` : ''}.`;
      }

      return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\` to allow ${summary}.`;
    }

    if (context.memberThresholdChanged && context.socialThresholdLabel) {
      return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\` proposer threshold to ≥${context.socialThresholdLabel} delegated SOCIAL.`;
    }

    if (onChainSummary) {
      return `On-chain: \`${context.permissionsRoleId}\` currently allows ${onChainSummary}. Toggle permissions to change the on-chain policy.`;
    }

    return `On-chain: ChangePolicyAddOrUpdateRole updates \`${context.permissionsRoleId}\` to allow ${summary}.`;
  }

  if (actionId === 'update_parameters') {
    return 'On-chain: ChangePolicyUpdateParameters updates proposal bond and voting period for future proposals.';
  }

  if (actionId === 'update_vote_policy') {
    const currentThresholdLabel = formatDefaultVotePolicyLabel(
      context?.currentVoteThreshold
    );
    const nextThresholdLabel = formatDefaultVotePolicyLabel(
      context?.nextVoteThreshold
    );
    const currentQuorumLabel = formatDefaultVoteQuorumLabel(
      context?.currentVoteQuorum ?? '0',
      context?.councilVotePoolSize ?? null,
      context?.currentVoteThreshold ?? null
    );
    const nextQuorumLabel = formatDefaultVoteQuorumLabel(
      context?.nextVoteQuorum ?? '0',
      context?.councilVotePoolSize ?? null,
      context?.nextVoteThreshold ?? null
    );

    if (context?.votePolicyChanged && context?.nextVoteThreshold) {
      return `On-chain: ChangePolicyUpdateDefaultVotePolicy updates default vote rules from ${currentThresholdLabel} · quorum ${currentQuorumLabel} to ${nextThresholdLabel} · quorum ${nextQuorumLabel}. Minimum approve floor uses whichever is stricter versus the approval threshold.`;
    }

    return `On-chain: ChangePolicyUpdateDefaultVotePolicy updates default vote rules (currently ${currentThresholdLabel} · quorum ${currentQuorumLabel}).`;
  }

  if (actionId === 'remove_role') {
    const targetRoleId = context?.targetRoleId?.trim();
    if (targetRoleId) {
      return `On-chain: ChangePolicyRemoveRole removes \`${targetRoleId}\` from the DAO policy.`;
    }

    return 'On-chain: ChangePolicyRemoveRole removes a role from the DAO policy.';
  }

  return (
    DAO_POLICY_ACTION_OPTIONS.find((option) => option.id === actionId)
      ?.outcome ?? ''
  );
}

export function getDaoPolicyRoleOptions(
  policy: GovernanceDaoPolicy | null | undefined
): string[] {
  return sortDaoPolicyRolesForDisplay(policy?.roles)
    .map((role) => role.name?.trim())
    .filter((name): name is string => Boolean(name));
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
    throw new Error(
      'Enter a valid role name (lowercase letters, numbers, underscores).'
    );
  }

  const resolvedPermissions = resolveAddRolePermissions(
    sourceRole,
    permissions
  );
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
  memberThresholdSmallest,
  votePolicyThreshold,
  votePolicyQuorum,
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
  memberThresholdSmallest?: string;
  votePolicyThreshold?: [number, number];
  votePolicyQuorum?: string;
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

      const permissionsDirty = rolePermissionsChanged(role, permissions);
      const thresholdDirty = roleMemberThresholdChanged(
        role,
        memberThresholdSmallest
      );

      if (!permissionsDirty && !thresholdDirty) {
        throw new Error(
          'Change permissions or proposer threshold before submitting.'
        );
      }

      if (
        thresholdDirty &&
        (!memberThresholdSmallest ||
          !isProposerThresholdWithinBounds(memberThresholdSmallest))
      ) {
        throw new Error(
          'Proposer threshold must be between 1 and 10,000 SOCIAL.'
        );
      }

      return buildDaoPolicyRoleUpdatePayload({
        role,
        permissions,
        description,
        memberThresholdSmallest: thresholdDirty
          ? memberThresholdSmallest
          : undefined,
      });
    }
    case 'update_parameters':
      return buildDaoPolicyParametersUpdatePayload({
        proposalBondYocto,
        proposalPeriodNs,
        description,
      });
    case 'update_vote_policy': {
      if (!votePolicyThreshold) {
        throw new Error('Choose a valid vote threshold.');
      }

      const currentThreshold = readDefaultVotePolicyThreshold(
        policy?.default_vote_policy
      );
      const currentQuorum = readDefaultVotePolicyQuorum(
        policy?.default_vote_policy
      );
      const nextQuorum = votePolicyQuorum ?? currentQuorum;
      const councilSize = resolveCouncilVotePoolSize(policy);

      if (!isVoteQuorumAllowed(nextQuorum, councilSize)) {
        throw new Error(
          'Choose a minimum approval floor that fits the current council size.'
        );
      }

      if (
        !votePolicyRulesChanged({
          currentThreshold,
          nextThreshold: votePolicyThreshold,
          currentQuorum,
          nextQuorum,
        })
      ) {
        throw new Error('Change vote rules before submitting.');
      }

      return buildDaoPolicyDefaultVotePolicyUpdatePayload({
        threshold: votePolicyThreshold,
        weightKind: policy?.default_vote_policy?.weight_kind ?? 'RoleWeight',
        quorum: nextQuorum,
        description,
      });
    }
    case 'add_role': {
      const normalizedNewRoleName = normalizeDaoRoleNameInput(
        newRoleName ?? ''
      );
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
        throw new Error(
          'Could not resolve role structure for this access mode.'
        );
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

export function buildDaoPolicyDefaultVotePolicyUpdatePayload({
  threshold,
  weightKind = 'RoleWeight',
  quorum = '0',
  description,
}: {
  threshold: [number, number];
  weightKind?: GovernanceDaoVotePolicy['weight_kind'];
  quorum?: string;
  description?: string;
}): DaoProposalPayload {
  if (threshold[0] <= 0 || threshold[1] <= 0 || threshold[0] > threshold[1]) {
    throw new Error('Vote threshold must be a valid fraction.');
  }

  const thresholdLabel = formatDefaultVotePolicyLabel(threshold);
  const quorumLabel = formatDefaultVoteQuorumLabel(quorum, null, threshold);

  return {
    proposal: {
      description:
        description?.trim() ||
        `Update default vote policy to ${thresholdLabel} · quorum ${quorumLabel}.`,
      kind: {
        ChangePolicyUpdateDefaultVotePolicy: {
          vote_policy: {
            weight_kind: weightKind,
            quorum,
            threshold,
          },
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
  memberThresholdSmallest,
}: {
  role: GovernanceDaoRole;
  permissions: string[];
  description?: string;
  memberThresholdSmallest?: string;
}): DaoProposalPayload {
  const roleName = role.name?.trim();
  if (!roleName) {
    throw new Error('Role name is required.');
  }

  if (permissions.length === 0) {
    throw new Error('Select at least one permission.');
  }

  const mergedPermissions = preserveNonEditableRolePermissions(
    role,
    permissions
  );

  const normalizedThreshold = memberThresholdSmallest?.trim();
  const kind =
    normalizedThreshold && isDaoMemberWeightRole(role)
      ? { Member: normalizedThreshold }
      : serializeDaoRoleKind(role);

  return {
    proposal: {
      description:
        description?.trim() ||
        `Update ${roleName} permissions on the OnSocial DAO.`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name: roleName,
            kind,
            permissions: mergedPermissions,
            vote_policy: role.vote_policy ?? {},
          },
        },
      },
    },
  };
}

export type CreatableDaoProposalActionGroup =
  | 'membership'
  | 'signaling'
  | 'treasury'
  | 'contracts';

export const CREATABLE_DAO_PROPOSAL_ACTION_GROUPS: ReadonlyArray<{
  id: CreatableDaoProposalActionGroup;
  label: string;
}> = [
  { id: 'membership', label: 'Membership' },
  { id: 'signaling', label: 'Community' },
  { id: 'treasury', label: 'Treasury' },
  { id: 'contracts', label: 'Contracts' },
];

export const CREATABLE_DAO_PROPOSAL_ACTIONS: ReadonlyArray<{
  id: CreatableDaoProposalAction;
  group: CreatableDaoProposalActionGroup;
  label: string;
  description: string;
}> = [
  {
    id: 'join_self',
    group: 'membership',
    label: 'Join role',
    description: 'Join a DAO role yourself.',
  },
  {
    id: 'add_member',
    group: 'membership',
    label: 'Add member',
    description: 'Nominate someone to join a DAO role.',
  },
  {
    id: 'leave_self',
    group: 'membership',
    label: 'Leave role',
    description: 'Leave a DAO role yourself.',
  },
  {
    id: 'remove_member',
    group: 'membership',
    label: 'Remove member',
    description: 'Nominate a member to leave a DAO role.',
  },
  {
    id: 'idea',
    group: 'signaling',
    label: DAO_SIGNAL_PROPOSAL_LABEL,
    description: DAO_SIGNAL_PROPOSAL_MENU_DESCRIPTION,
  },
  {
    id: 'transfer',
    group: 'treasury',
    label: 'Transfer',
    description: 'Send NEAR from the DAO to a recipient account.',
  },
  {
    id: 'fund_season_pool',
    group: 'treasury',
    label: 'Fund rally pool',
    description: 'Fund a live rally pool from the treasury DAO SOCIAL balance.',
  },
  {
    id: 'withdraw_boost_infra',
    group: 'treasury',
    label: 'Withdraw boost infra',
    description:
      'Withdraw SOCIAL from the boost contract infra pool to the treasury wallet.',
  },
  {
    id: 'set_boost_infra_authority',
    group: 'contracts',
    label: 'Delegate boost infra withdraw',
    description:
      'Authorize the Treasury DAO to withdraw from the boost infra pool after governance owns boost.',
  },
  {
    id: 'transfer_ownership',
    group: 'contracts',
    label: 'Transfer ownership',
    description:
      'Transfer admin ownership of a DAO-managed protocol contract to a new account.',
  },
  {
    id: 'contract_upgrade',
    group: 'contracts',
    label: 'Upgrade contract',
    description:
      'Upgrade a DAO-owned protocol contract from a published global WASM hash.',
  },
  {
    id: 'contract_config',
    group: 'contracts',
    label: 'Configure contract',
    description: 'Update on-chain settings for a DAO-owned protocol contract.',
  },
];

export type GovernanceCreateActionMenuItem =
  | {
      kind: 'section';
      id: string;
      label: string;
    }
  | {
      kind: 'proposal';
      id: CreatableDaoProposalAction;
      label: string;
      description: string;
    }
  | {
      kind: 'policy_link';
      id: DaoPolicyActionId;
      label: string;
      description: string;
      href: string;
    };

export function buildGovernancePolicyActionPath(
  actionId: DaoPolicyActionId,
  board: GovernanceDaoBoard = 'governance'
): string {
  return buildGovernancePathWithBoard('/governance/policy', board, {
    action: actionId,
  });
}

export function resolveAvailablePolicyActionsForProposer(
  policy: GovernanceDaoPolicy | null | undefined,
  proposerAccountId: string,
  delegatedWeight: string
): Array<(typeof DAO_POLICY_ACTION_OPTIONS)[number]> {
  const proposer = proposerAccountId.trim();
  if (!proposer || !canProposePolicyChange(policy, proposer, delegatedWeight)) {
    return [];
  }

  return DAO_POLICY_ACTION_OPTIONS.filter((option) =>
    canProposePolicyAction(policy, proposer, delegatedWeight, option.id)
  );
}

export function buildGovernanceCreateActionMenuItems({
  availableProposalActions,
  availablePolicyActions = [],
  daoBoard = 'governance',
}: {
  availableProposalActions: CreatableDaoProposalAction[];
  availablePolicyActions?: Array<(typeof DAO_POLICY_ACTION_OPTIONS)[number]>;
  daoBoard?: GovernanceDaoBoard;
}): GovernanceCreateActionMenuItem[] {
  const items: GovernanceCreateActionMenuItem[] = [];

  for (const group of CREATABLE_DAO_PROPOSAL_ACTION_GROUPS) {
    const proposalOptions = CREATABLE_DAO_PROPOSAL_ACTIONS.filter(
      (option) =>
        option.group === group.id &&
        availableProposalActions.includes(option.id)
    );

    if (proposalOptions.length === 0) {
      continue;
    }

    items.push({
      kind: 'section',
      id: group.id,
      label: group.label,
    });

    for (const option of proposalOptions) {
      items.push({
        kind: 'proposal',
        id: option.id,
        label: option.label,
        description: option.description,
      });
    }
  }

  if (availablePolicyActions.length > 0) {
    items.push({
      kind: 'section',
      id: 'policy',
      label: 'Policy',
    });

    for (const option of availablePolicyActions) {
      items.push({
        kind: 'policy_link',
        id: option.id,
        label: option.label,
        description: option.outcome,
        href: buildGovernancePolicyActionPath(option.id, daoBoard),
      });
    }
  }

  return items;
}

export function getCreatableDaoProposalActionOption(
  actionId: CreatableDaoProposalAction
) {
  return CREATABLE_DAO_PROPOSAL_ACTIONS.find(
    (option) => option.id === actionId
  );
}

export function buildDaoIdeaProposalPayload({
  description,
}: {
  description?: string;
}): DaoProposalPayload {
  const proposalDescription = description?.trim();
  if (!proposalDescription) {
    throw new Error('Signal description is required.');
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
  kind: Exclude<CreatableDaoProposalKind, 'idea' | 'transfer'>;
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

function encodeFunctionCallArgs(args: Record<string, string>): string {
  return btoa(JSON.stringify(args));
}

function encodeJsonFunctionCallArgs(args: unknown): string {
  return btoa(JSON.stringify(args));
}

function buildFundSeasonPoolTransferMsg(seasonId: string): string {
  return JSON.stringify({
    v: 1,
    action: 'fund_season_pool',
    season_id: seasonId,
  });
}

export function buildDaoTransferOwnershipProposalPayload({
  contractId,
  contractLabel,
  newOwnerId,
  transferMethod,
  transferArgField,
  gas,
  deposit,
  description,
}: {
  contractId: string;
  contractLabel?: string;
  newOwnerId: string;
  transferMethod: string;
  transferArgField: 'new_owner' | 'owner_id';
  gas: number;
  deposit: string;
  description?: string;
}): DaoProposalPayload {
  const normalizedContractId = contractId.trim();
  if (!normalizedContractId) {
    throw new Error('Contract is required.');
  }

  const normalizedNewOwner = newOwnerId.trim();
  if (!normalizedNewOwner) {
    throw new Error('New owner account is required.');
  }

  const assetLabel = contractLabel?.trim() || normalizedContractId;
  const proposalDescription =
    description?.trim() ||
    `Transfer ${assetLabel} ownership to ${normalizedNewOwner}.`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        FunctionCall: {
          receiver_id: normalizedContractId,
          actions: [
            {
              method_name: transferMethod,
              args: encodeFunctionCallArgs({
                [transferArgField]: normalizedNewOwner,
              }),
              deposit,
              gas,
            },
          ],
        },
      },
    },
  };
}

export function buildDaoContractConfigProposalPayload(input: {
  operationId: DaoContractConfigOperationId;
  contractLabel?: string;
  description?: string;
  routing?: SocialSpendActionRoutingDraft;
  seasonConfig?: SocialSpendSeasonConfigDraft;
}): DaoProposalPayload {
  const operation = getDaoContractConfigOperation(input.operationId);
  if (!operation) {
    throw new Error('Contract setting is required.');
  }

  const assetLabel = input.contractLabel?.trim() || operation.contractId;

  if (input.operationId === 'social_spend_set_season_config') {
    const seasonConfig = input.seasonConfig;
    if (!seasonConfig) {
      throw new Error('Season config is required.');
    }
    const validationError = validateSeasonConfigDraft(seasonConfig);
    if (validationError) {
      throw new Error(validationError);
    }

    const payload = seasonConfigDraftToInput(seasonConfig);
    const proposalDescription =
      input.description?.trim() ||
      `Configure ${assetLabel} rally season (${formatSeasonConfigSummary(seasonConfig)}).`;

    return {
      proposal: {
        description: proposalDescription,
        kind: {
          FunctionCall: {
            receiver_id: operation.contractId,
            actions: [
              {
                method_name: 'set_season_config',
                args: encodeJsonFunctionCallArgs(payload),
                deposit: operation.deposit,
                gas: operation.gas,
              },
            ],
          },
        },
      },
    };
  }

  const routing = input.routing;
  if (!routing) {
    throw new Error('Routing config is required.');
  }

  if (!validateSocialSpendActionRoutingBps(routing)) {
    throw new Error('Routing shares must sum to 100% (10,000 bps).');
  }

  const routingSummary = formatSocialSpendActionRoutingSummary(routing, {
    protocolFeesRouteToBoost: true,
  });
  const proposalDescription =
    input.description?.trim() ||
    `Configure ${assetLabel} ${operation.label.toLowerCase()} (${routingSummary}).`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        FunctionCall: {
          receiver_id: operation.contractId,
          actions: [
            {
              method_name: 'set_action_config',
              args: encodeJsonFunctionCallArgs({
                action_id: operation.actionId,
                config: {
                  label: routing.label,
                  active: routing.active,
                  min_amount: routing.min_amount,
                  target_types: routing.target_types,
                  treasury_bps: routing.treasury_bps,
                  season_pool_bps: routing.season_pool_bps,
                  target_bps: routing.target_bps,
                  burn_bps: routing.burn_bps,
                  season_required: routing.season_required,
                  allow_self_target: routing.allow_self_target,
                },
              }),
              deposit: operation.deposit,
              gas: operation.gas,
            },
          ],
        },
      },
    },
  };
}

export function buildDaoContractUpgradeProposalPayload({
  contractId,
  contractLabel,
  codeHash,
  gas = CONTRACT_UPGRADE_FUNCTION_CALL_GAS,
  description,
}: {
  contractId: string;
  contractLabel?: string;
  codeHash: string;
  gas?: number;
  description?: string;
}): DaoProposalPayload {
  const normalizedContractId = contractId.trim();
  if (!normalizedContractId) {
    throw new Error('Contract is required.');
  }

  const normalizedCodeHash = normalizePublishedCodeHash(codeHash);
  if (!normalizedCodeHash) {
    throw new Error('Enter a valid published global code hash.');
  }

  if (!isDaoHashUpgradableContractId(normalizedContractId)) {
    throw new Error('This contract does not support hash-based upgrades.');
  }

  const assetLabel = contractLabel?.trim() || normalizedContractId;
  const proposalDescription =
    description?.trim() ||
    `Upgrade ${assetLabel} by published code hash (250 TGas).`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        FunctionCall: {
          receiver_id: normalizedContractId,
          actions: [
            {
              method_name: 'update_contract_from_hash',
              args: encodeFunctionCallArgs({
                code_hash: normalizedCodeHash,
              }),
              deposit: '0',
              gas,
            },
          ],
        },
      },
    },
  };
}

export function buildDaoWithdrawBoostInfraPayload({
  contractId,
  amountYocto,
  receiverId,
  description,
}: {
  contractId: string;
  amountYocto: string;
  receiverId: string;
  description?: string;
}): DaoProposalPayload {
  const normalizedContractId = contractId.trim();
  const normalizedReceiverId = receiverId.trim();
  if (!normalizedContractId || !normalizedReceiverId) {
    throw new Error('Boost contract and receiver are required.');
  }

  const normalizedAmount = amountYocto.trim();
  if (!/^\d+$/.test(normalizedAmount) || normalizedAmount === '0') {
    throw new Error('Enter a valid SOCIAL amount to withdraw.');
  }

  const proposalDescription =
    description?.trim() ||
    `Withdraw ${yoctoToSocial(normalizedAmount)} SOCIAL from boost infra pool to ${normalizedReceiverId}.`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        FunctionCall: {
          receiver_id: normalizedContractId,
          actions: [
            {
              method_name: 'withdraw_infra',
              args: encodeFunctionCallArgs({
                amount: normalizedAmount,
                receiver_id: normalizedReceiverId,
              }),
              deposit: BOOST_FUNCTION_CALL_DEPOSIT,
              gas: BOOST_WITHDRAW_INFRA_FUNCTION_CALL_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildDaoSetBoostInfraAuthorityPayload({
  contractId,
  authorityId = TREASURY_DAO_ACCOUNT,
  description,
}: {
  contractId: string;
  authorityId?: string;
  description?: string;
}): DaoProposalPayload {
  const normalizedContractId = contractId.trim();
  const normalizedAuthorityId = authorityId.trim();
  if (!normalizedContractId || !normalizedAuthorityId) {
    throw new Error('Boost contract and treasury authority are required.');
  }

  const proposalDescription =
    description?.trim() ||
    `Delegate boost infra withdrawals to ${normalizedAuthorityId}.`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        FunctionCall: {
          receiver_id: normalizedContractId,
          actions: [
            {
              method_name: 'set_infra_withdraw_authority',
              args: encodeJsonFunctionCallArgs({
                authority: normalizedAuthorityId,
              }),
              deposit: BOOST_FUNCTION_CALL_DEPOSIT,
              gas: SOCIAL_SPEND_FUNCTION_CALL_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildDaoFundSeasonPoolPayload({
  tokenContractId = TOKEN_CONTRACT,
  contractId,
  seasonId,
  amountYocto,
  description,
}: {
  tokenContractId?: string;
  contractId: string;
  seasonId: string;
  amountYocto: string;
  description?: string;
}): DaoProposalPayload {
  const normalizedTokenContractId = tokenContractId.trim();
  const normalizedSocialSpendContractId = contractId.trim();
  if (!normalizedTokenContractId || !normalizedSocialSpendContractId) {
    throw new Error('SOCIAL token and social-spend contracts are required.');
  }

  const normalizedSeasonId = seasonId.trim();
  if (!normalizedSeasonId) {
    throw new Error('Season is required.');
  }

  const normalizedAmount = amountYocto.trim();
  if (!/^\d+$/.test(normalizedAmount) || normalizedAmount === '0') {
    throw new Error('Enter a valid SOCIAL amount to fund.');
  }

  const proposalDescription =
    description?.trim() ||
    `Fund ${normalizedSeasonId} rally pool with ${yoctoToSocial(normalizedAmount)} SOCIAL from the DAO treasury.`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        FunctionCall: {
          receiver_id: normalizedTokenContractId,
          actions: [
            {
              method_name: 'ft_transfer_call',
              args: encodeFunctionCallArgs({
                receiver_id: normalizedSocialSpendContractId,
                amount: normalizedAmount,
                msg: buildFundSeasonPoolTransferMsg(normalizedSeasonId),
              }),
              deposit: SOCIAL_SPEND_FUNCTION_CALL_DEPOSIT,
              gas: SOCIAL_SPEND_FUNCTION_CALL_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildDaoTransferProposalPayload({
  receiverId,
  amountYocto,
  tokenId = '',
  description,
  tokenSymbol,
}: {
  receiverId: string;
  amountYocto: string;
  tokenId?: string;
  description?: string;
  tokenSymbol?: string;
}): DaoProposalPayload {
  const normalizedReceiver = receiverId.trim();
  if (!normalizedReceiver) {
    throw new Error('Recipient account is required.');
  }

  const normalizedAmount = amountYocto.trim();
  if (!/^\d+$/.test(normalizedAmount) || normalizedAmount === '0') {
    throw new Error('Enter a valid transfer amount.');
  }

  const normalizedTokenId = tokenId.trim();
  const assetLabel =
    tokenSymbol?.trim() ||
    (normalizedTokenId
      ? normalizedTokenId.includes('social')
        ? `${yoctoToSocial(normalizedAmount)} SOCIAL`
        : normalizedTokenId
      : `${yoctoToNear(normalizedAmount)} NEAR`);

  const proposalDescription =
    description?.trim() ||
    `Transfer ${assetLabel} from the DAO to ${normalizedReceiver}.`;

  return {
    proposal: {
      description: proposalDescription,
      kind: {
        Transfer: {
          token_id: normalizedTokenId,
          receiver_id: normalizedReceiver,
          amount: normalizedAmount,
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
