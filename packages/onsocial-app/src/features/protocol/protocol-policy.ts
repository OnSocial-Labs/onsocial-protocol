import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { findProtocolRole } from '@/features/protocol/protocol-create';
import type {
  ProtocolDaoPolicy,
  ProtocolDaoRole,
} from '@/features/protocol/types';
import { encodeDaoConfigMetadata } from '@/features/protocol/dao-branding';

export type ProtocolPolicyActionId =
  | 'update_parameters'
  | 'update_config'
  | 'update_vote_policy'
  | 'update_permissions'
  | 'add_role'
  | 'remove_role';

export type ProtocolAddRoleAccessMode = 'full_access' | 'custom';

export const PROTOCOL_POLICY_ACTION_OPTIONS: Array<{
  id: ProtocolPolicyActionId;
  label: string;
  group: 'policy' | 'roles';
  hint: string;
}> = [
  {
    id: 'update_vote_policy',
    label: 'Vote policy',
    group: 'policy',
    hint: 'Change approval threshold and quorum for future proposals.',
  },
  {
    id: 'update_permissions',
    label: 'Permissions',
    group: 'policy',
    hint: 'Change which proposal kinds a public role can submit.',
  },
  {
    id: 'update_parameters',
    label: 'Parameters',
    group: 'policy',
    hint: 'Change proposal bond or voting period.',
  },
  {
    id: 'update_config',
    label: 'Config',
    group: 'policy',
    hint: 'Change the DAO name and on-chain purpose.',
  },
  {
    id: 'add_role',
    label: 'Add role',
    group: 'roles',
    hint: 'Name a council or public role with permissions.',
  },
  {
    id: 'remove_role',
    label: 'Remove role',
    group: 'roles',
    hint: 'Remove a role. Keep at least one full-access role.',
  },
];

/** Everyday settings actions pinned at the top of the settings drawer. */
export const PROTOCOL_POLICY_ACTION_COMMON: ProtocolPolicyActionId[] = [
  'update_vote_policy',
  'update_permissions',
];

export const PROTOCOL_POLICY_ACTION_GROUPS: Array<{
  id: 'policy' | 'roles';
  label: string;
}> = [
  { id: 'policy', label: 'Policy' },
  { id: 'roles', label: 'Roles' },
];

export function protocolPolicyActionLabel(
  actionId: ProtocolPolicyActionId
): string {
  return (
    PROTOCOL_POLICY_ACTION_OPTIONS.find((option) => option.id === actionId)
      ?.label ?? 'Settings'
  );
}

export function isProtocolPolicyActionId(
  value: string
): value is ProtocolPolicyActionId {
  return PROTOCOL_POLICY_ACTION_OPTIONS.some((option) => option.id === value);
}

const LAST_POLICY_ACTION_KEY = 'onsocial.protocol.lastPolicyAction';

export function readLastProtocolPolicyAction(): ProtocolPolicyActionId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_POLICY_ACTION_KEY)?.trim() ?? '';
    return isProtocolPolicyActionId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function rememberProtocolPolicyAction(
  actionId: ProtocolPolicyActionId
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_POLICY_ACTION_KEY, actionId);
  } catch {
    // ignore quota / private mode
  }
}

export const PROTOCOL_ADD_ROLE_ACCESS_OPTIONS: Array<{
  id: ProtocolAddRoleAccessMode;
  label: string;
  hint: string;
}> = [
  {
    id: 'full_access',
    label: 'Full access',
    hint: 'Council role with *:* — copies guardians/council membership',
  },
  {
    id: 'custom',
    label: 'Choose permissions',
    hint: 'Public proposer — copies SOCIAL gate and vote rules',
  },
];

export const PROTOCOL_EDITABLE_PERMISSIONS = [
  { id: 'call:AddProposal', label: 'Function call' },
  { id: 'add_member_to_role:AddProposal', label: 'Join' },
  { id: 'remove_member_from_role:AddProposal', label: 'Leave' },
  { id: 'vote:AddProposal', label: 'Signal' },
  { id: 'transfer:AddProposal', label: 'Transfer' },
  { id: 'policy_add_or_update_role:AddProposal', label: 'Role changes' },
  { id: 'policy_update_parameters:AddProposal', label: 'Parameter changes' },
] as const;

const PROTOCOL_EDITABLE_PERMISSION_IDS = new Set<string>(
  PROTOCOL_EDITABLE_PERMISSIONS.map((option) => option.id)
);

const DELEGATED_PROPOSERS_ROLE_ID = 'delegated_proposers';
const GUARDIANS_ROLE_ID = 'guardians';
const WILDCARD_ADD_PROPOSAL_PERMISSION = '*:AddProposal';

export interface ProtocolDaoConfig {
  name: string;
  purpose: string;
  metadata: string;
}

export function daysToProposalPeriodNs(daysInput: string): string {
  const days = Number(daysInput.trim());
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('Enter a valid proposal period in days.');
  }
  return String(BigInt(Math.round(days * 24 * 60 * 60)) * 1_000_000_000n);
}

export function proposalPeriodNsToDays(ns: string | null | undefined): string {
  if (!ns || !/^\d+$/.test(ns)) return '';
  const days = Number(BigInt(ns) / (24n * 60n * 60n * 1_000_000_000n));
  return Number.isFinite(days) && days > 0 ? String(days) : '';
}

export function parseVoteThresholdInputs(
  numeratorInput: string,
  denominatorInput: string
): [number, number] {
  const numerator = Number(numeratorInput.trim());
  const denominator = Number(denominatorInput.trim());
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    numerator <= 0 ||
    denominator <= 0 ||
    numerator > denominator
  ) {
    throw new Error('Vote threshold must be a valid fraction (e.g. 1 / 2).');
  }
  return [numerator, denominator];
}

export function normalizeProtocolRoleName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized || !/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error(
      'Role name must start with a letter (lowercase, numbers, underscores).'
    );
  }
  return normalized;
}

export function getProtocolPolicyRoleOptions(
  policy: ProtocolDaoPolicy | null | undefined
): string[] {
  return (
    policy?.roles
      ?.map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name))
      .sort((left, right) => left.localeCompare(right)) ?? []
  );
}

export function roleHasWildcardPermissions(role: ProtocolDaoRole): boolean {
  return (role.permissions ?? []).includes('*:*');
}

export function isFullAccessProtocolRole(role: ProtocolDaoRole): boolean {
  return roleHasWildcardPermissions(role);
}

function isProtocolCouncilRole(role: ProtocolDaoRole): boolean {
  const name = role.name?.trim().toLowerCase() ?? '';
  if (name === GUARDIANS_ROLE_ID || name === 'council') return true;
  return (
    roleHasWildcardPermissions(role) &&
    Array.isArray(role.kind?.Group) &&
    (role.kind?.Group?.length ?? 0) > 0
  );
}

export function isEditableProtocolPolicyRole(role: ProtocolDaoRole): boolean {
  const name = role.name?.trim();
  if (!name) return false;
  if (roleHasWildcardPermissions(role)) return false;
  if (isProtocolCouncilRole(role)) return false;
  return true;
}

export function getEditableProtocolPolicyRoleOptions(
  policy: ProtocolDaoPolicy | null | undefined
): string[] {
  return (
    policy?.roles
      ?.filter(isEditableProtocolPolicyRole)
      .map((role) => role.name!.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)) ?? []
  );
}

export function getFullAccessProtocolRoleIds(
  policy: ProtocolDaoPolicy | null | undefined
): string[] {
  const names =
    policy?.roles
      ?.filter(isFullAccessProtocolRole)
      .map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  return [...new Set(names)];
}

export function getRemoveProtocolPolicyRoleBlockReason(
  policy: ProtocolDaoPolicy | null | undefined,
  roleId: string
): string {
  const normalizedRoleId = roleId.trim();
  if (!normalizedRoleId) return 'Choose a role to remove.';
  const role = findProtocolRole(policy, normalizedRoleId);
  if (!role) return `Role ${normalizedRoleId} is not in DAO policy.`;
  if (!isFullAccessProtocolRole(role)) return '';
  if (getFullAccessProtocolRoleIds(policy).length <= 1) {
    return 'Cannot remove the only full-access role. Add another council role with full access (*:*) first.';
  }
  return '';
}

export function getRemovableProtocolPolicyRoleOptions(
  policy: ProtocolDaoPolicy | null | undefined
): string[] {
  return getProtocolPolicyRoleOptions(policy).filter(
    (roleId) => getRemoveProtocolPolicyRoleBlockReason(policy, roleId) === ''
  );
}

export function findFullAccessProtocolRole(
  policy: ProtocolDaoPolicy | null | undefined
): ProtocolDaoRole | null {
  const guardians = findProtocolRole(policy, GUARDIANS_ROLE_ID);
  if (guardians && isFullAccessProtocolRole(guardians)) return guardians;
  return policy?.roles?.find(isFullAccessProtocolRole) ?? null;
}

export function findDelegatedProposersRole(
  policy: ProtocolDaoPolicy | null | undefined
): ProtocolDaoRole | null {
  const byName = findProtocolRole(policy, DELEGATED_PROPOSERS_ROLE_ID);
  if (byName) return byName;
  return (
    policy?.roles?.find(
      (role) =>
        role.kind?.Member != null &&
        role.kind.Member !== '' &&
        (role.permissions ?? []).includes('call:AddProposal')
    ) ?? null
  );
}

export function resolveAddRoleSourceRole(
  policy: ProtocolDaoPolicy | null | undefined,
  accessMode: ProtocolAddRoleAccessMode
): ProtocolDaoRole | null {
  if (accessMode === 'full_access') {
    return findFullAccessProtocolRole(policy);
  }
  return findDelegatedProposersRole(policy);
}

export function getAddRoleAccessBlockReason(
  policy: ProtocolDaoPolicy | null | undefined,
  accessMode: ProtocolAddRoleAccessMode
): string {
  if (resolveAddRoleSourceRole(policy, accessMode)) return '';
  if (accessMode === 'full_access') {
    return 'No council role in policy to copy full access from.';
  }
  return 'No public proposer role in policy to copy the SOCIAL gate from.';
}

function serializeProtocolRoleKind(
  role: ProtocolDaoRole
): { Group: string[] } | { Member: string } {
  if (role.kind?.Group?.length) {
    return { Group: role.kind.Group };
  }
  if (role.kind?.Member != null && role.kind.Member !== '') {
    return { Member: role.kind.Member };
  }
  throw new Error(`Role ${role.name ?? 'unknown'} has no supported kind.`);
}

export function preserveNonEditableRolePermissions(
  role: ProtocolDaoRole,
  nextEditablePermissions: string[]
): string[] {
  const preserved = (role.permissions ?? []).filter(
    (permission) =>
      !PROTOCOL_EDITABLE_PERMISSION_IDS.has(permission) &&
      permission !== WILDCARD_ADD_PROPOSAL_PERMISSION
  );
  return [...new Set([...preserved, ...nextEditablePermissions])];
}

export function buildProtocolPolicyParametersPayload(opts: {
  proposalBondYocto?: string;
  proposalPeriodNs?: string;
  description?: string;
}): ProtocolProposalPayload {
  const parameters: {
    proposal_bond?: string;
    proposal_period?: string;
  } = {};
  if (opts.proposalBondYocto?.trim()) {
    parameters.proposal_bond = opts.proposalBondYocto.trim();
  }
  if (opts.proposalPeriodNs?.trim()) {
    parameters.proposal_period = opts.proposalPeriodNs.trim();
  }
  if (!parameters.proposal_bond && !parameters.proposal_period) {
    throw new Error('Set at least one parameter to update.');
  }
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        'Update DAO proposal bond and voting period.',
      kind: {
        ChangePolicyUpdateParameters: { parameters },
      },
    },
  };
}

export function buildProtocolPolicyConfigPayload(opts: {
  name: string;
  purpose: string;
  metadata?: string;
  description?: string;
}): ProtocolProposalPayload {
  const name = opts.name.trim();
  const purpose = opts.purpose.trim();
  if (!name) throw new Error('Enter a DAO name.');
  if (!purpose) throw new Error('Enter a DAO purpose.');
  return {
    proposal: {
      description: opts.description?.trim() || `Update DAO config for ${name}.`,
      kind: {
        ChangeConfig: {
          config: {
            name,
            purpose,
            // Sputnik Config.metadata is Base64VecU8 — never plain JSON.
            metadata: encodeDaoConfigMetadata(opts.metadata),
          },
        },
      },
    },
  };
}

export function buildProtocolPolicyVotePayload(opts: {
  threshold: [number, number];
  quorum?: string;
  weightKind?: 'RoleWeight' | 'TokenWeight';
  description?: string;
}): ProtocolProposalPayload {
  const [num, den] = opts.threshold;
  if (num <= 0 || den <= 0 || num > den) {
    throw new Error('Vote threshold must be a valid fraction.');
  }
  const quorum = opts.quorum?.trim() || '0';
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Update default vote policy to ${num}/${den} · quorum ${quorum}.`,
      kind: {
        ChangePolicyUpdateDefaultVotePolicy: {
          vote_policy: {
            weight_kind: opts.weightKind ?? 'RoleWeight',
            quorum,
            threshold: opts.threshold,
          },
        },
      },
    },
  };
}

export function buildProtocolPolicyAddRolePayload(opts: {
  policy: ProtocolDaoPolicy | null | undefined;
  newRoleName: string;
  accessMode?: ProtocolAddRoleAccessMode;
  permissions?: string[];
  description?: string;
}): ProtocolProposalPayload {
  const name = normalizeProtocolRoleName(opts.newRoleName);
  const accessMode = opts.accessMode ?? 'full_access';
  const source = resolveAddRoleSourceRole(opts.policy, accessMode);
  if (!source) {
    throw new Error(getAddRoleAccessBlockReason(opts.policy, accessMode));
  }

  const permissions = roleHasWildcardPermissions(source)
    ? (source.permissions ?? ['*:*'])
    : [...new Set(opts.permissions ?? [])];
  if (permissions.length === 0) {
    throw new Error('Select at least one permission.');
  }

  const accessLabel = roleHasWildcardPermissions(source)
    ? 'full access'
    : 'public permissions';

  return {
    proposal: {
      description:
        opts.description?.trim() || `Add ${name} role (${accessLabel}).`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name,
            kind: serializeProtocolRoleKind(source),
            permissions,
            vote_policy: source.vote_policy ?? {},
          },
        },
      },
    },
  };
}

export function buildProtocolPolicyRemoveRolePayload(opts: {
  roleId: string;
  policy?: ProtocolDaoPolicy | null;
  description?: string;
}): ProtocolProposalPayload {
  const roleId = opts.roleId.trim();
  const blockReason = getRemoveProtocolPolicyRoleBlockReason(
    opts.policy,
    roleId
  );
  if (blockReason) throw new Error(blockReason);
  return {
    proposal: {
      description: opts.description?.trim() || `Remove ${roleId} from the DAO.`,
      kind: {
        ChangePolicyRemoveRole: { role: roleId },
      },
    },
  };
}

export function buildProtocolPolicyPermissionsPayload(opts: {
  policy: ProtocolDaoPolicy | null;
  roleId: string;
  permissions: string[];
  description?: string;
}): ProtocolProposalPayload {
  const role = findProtocolRole(opts.policy, opts.roleId);
  if (!role) throw new Error('Choose a role to update.');
  if (!isEditableProtocolPolicyRole(role)) {
    throw new Error('That role cannot be edited here.');
  }
  if (opts.permissions.length === 0) {
    throw new Error('Select at least one permission.');
  }
  const mergedPermissions = preserveNonEditableRolePermissions(
    role,
    opts.permissions
  );
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Update ${opts.roleId.trim()} permissions.`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name: role.name,
            kind: serializeProtocolRoleKind(role),
            permissions: mergedPermissions,
            vote_policy: role.vote_policy ?? {},
          },
        },
      },
    },
  };
}

export function buildProtocolPolicyPayload(opts: {
  actionId: ProtocolPolicyActionId;
  policy: ProtocolDaoPolicy | null;
  description?: string;
  proposalBondYocto?: string;
  proposalPeriodNs?: string;
  configName?: string;
  configPurpose?: string;
  configMetadata?: string;
  voteThreshold?: [number, number];
  voteQuorum?: string;
  newRoleName?: string;
  addRoleAccessMode?: ProtocolAddRoleAccessMode;
  addRolePermissions?: string[];
  removeRoleId?: string;
  permissionsRoleId?: string;
  permissions?: string[];
}): ProtocolProposalPayload {
  switch (opts.actionId) {
    case 'update_parameters':
      return buildProtocolPolicyParametersPayload({
        proposalBondYocto: opts.proposalBondYocto,
        proposalPeriodNs: opts.proposalPeriodNs,
        description: opts.description,
      });
    case 'update_config':
      return buildProtocolPolicyConfigPayload({
        name: opts.configName ?? '',
        purpose: opts.configPurpose ?? '',
        metadata: opts.configMetadata,
        description: opts.description,
      });
    case 'update_vote_policy':
      if (!opts.voteThreshold) {
        throw new Error('Choose a valid vote threshold.');
      }
      return buildProtocolPolicyVotePayload({
        threshold: opts.voteThreshold,
        quorum: opts.voteQuorum,
        weightKind: opts.policy?.default_vote_policy?.weight_kind,
        description: opts.description,
      });
    case 'update_permissions':
      return buildProtocolPolicyPermissionsPayload({
        policy: opts.policy,
        roleId: opts.permissionsRoleId ?? '',
        permissions: opts.permissions ?? [],
        description: opts.description,
      });
    case 'add_role':
      return buildProtocolPolicyAddRolePayload({
        policy: opts.policy,
        newRoleName: opts.newRoleName ?? '',
        accessMode: opts.addRoleAccessMode,
        permissions: opts.addRolePermissions,
        description: opts.description,
      });
    case 'remove_role':
      return buildProtocolPolicyRemoveRolePayload({
        roleId: opts.removeRoleId ?? '',
        policy: opts.policy,
        description: opts.description,
      });
    default: {
      const exhaustive: never = opts.actionId;
      throw new Error(`Unsupported policy action: ${exhaustive}`);
    }
  }
}
