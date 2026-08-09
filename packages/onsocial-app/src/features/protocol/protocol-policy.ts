import type { ProtocolDaoPolicy, ProtocolDaoRole } from '@/features/protocol/types';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { findProtocolRole } from '@/features/protocol/protocol-create';

export type ProtocolPolicyActionId =
  | 'update_parameters'
  | 'update_config'
  | 'update_vote_policy'
  | 'update_permissions'
  | 'add_role'
  | 'remove_role';

export const PROTOCOL_POLICY_ACTION_OPTIONS: Array<{
  id: ProtocolPolicyActionId;
  label: string;
}> = [
  { id: 'update_parameters', label: 'Parameters' },
  { id: 'update_config', label: 'Config' },
  { id: 'update_vote_policy', label: 'Vote policy' },
  { id: 'update_permissions', label: 'Permissions' },
  { id: 'add_role', label: 'Add role' },
  { id: 'remove_role', label: 'Remove role' },
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

function fullAccessRoleTemplate(): ProtocolDaoRole {
  return {
    name: 'council',
    kind: { Group: [] },
    permissions: ['*:*'],
    vote_policy: {},
  };
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
            metadata: opts.metadata?.trim() ?? '',
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
  newRoleName: string;
  description?: string;
}): ProtocolProposalPayload {
  const name = normalizeProtocolRoleName(opts.newRoleName);
  const source = fullAccessRoleTemplate();
  return {
    proposal: {
      description:
        opts.description?.trim() || `Add ${name} role (full access).`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name,
            kind: source.kind,
            permissions: source.permissions ?? ['*:*'],
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
  if (!roleId) throw new Error('Choose a role to remove.');
  if (opts.policy && !findProtocolRole(opts.policy, roleId)) {
    throw new Error(`Role ${roleId} was not found.`);
  }
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
  if ((role.permissions ?? []).includes('*:*')) {
    throw new Error('Full-access roles cannot be edited here.');
  }
  if (opts.permissions.length === 0) {
    throw new Error('Select at least one permission.');
  }
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Update ${opts.roleId.trim()} permissions.`,
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name: role.name,
            kind: role.kind,
            permissions: [...new Set(opts.permissions)],
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
        newRoleName: opts.newRoleName ?? '',
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
