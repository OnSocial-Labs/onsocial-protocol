import { findProtocolRole } from '@/features/protocol/protocol-create';
import type {
  ProtocolDaoPolicy,
  ProtocolDaoRole,
  ProtocolDaoVotePolicy,
} from '@/features/protocol/types';

/** Keep in sync with PROTOCOL_EDITABLE_PERMISSIONS in protocol-policy.ts */
const EDITABLE_PERMISSION_IDS = new Set<string>([
  'call:AddProposal',
  'add_member_to_role:AddProposal',
  'remove_member_from_role:AddProposal',
  'vote:AddProposal',
  'transfer:AddProposal',
  'policy_add_or_update_role:AddProposal',
  'policy_update_parameters:AddProposal',
]);

const WILDCARD_ADD_PROPOSAL_PERMISSION = '*:AddProposal';
const GUARDIANS_ROLE_ID = 'guardians';
const COUNCIL_VOTE_ROLE_IDS = ['guardians', 'council'] as const;

export const PROTOCOL_SIGNAL_PERMISSION = 'vote:AddProposal';
export const PROTOCOL_TRANSFER_PERMISSION = 'transfer:AddProposal';

/** Partner + join + leave — actionable public proposals. */
export const PROTOCOL_ACTIONS_ONLY_PERMISSIONS = [
  'call:AddProposal',
  'add_member_to_role:AddProposal',
  'remove_member_from_role:AddProposal',
] as const;

/** Actions + Signal (Vote — text only). */
export const PROTOCOL_ALL_PUBLIC_PERMISSIONS = [
  ...PROTOCOL_ACTIONS_ONLY_PERMISSIONS,
  PROTOCOL_SIGNAL_PERMISSION,
] as const;

/** Every editable proposal kind the picker can express. */
export const PROTOCOL_PROPOSE_ALL_PERMISSIONS = [
  ...PROTOCOL_ALL_PUBLIC_PERMISSIONS,
  'policy_add_or_update_role:AddProposal',
  'policy_update_parameters:AddProposal',
  PROTOCOL_TRANSFER_PERMISSION,
] as const;

export type ProtocolPermissionPresetId =
  | 'all_public'
  | 'actions_only'
  | 'propose_all'
  | 'custom';

export const PROTOCOL_VOTE_THRESHOLD_PRESETS = [
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

export type ProtocolVoteThresholdPresetId =
  (typeof PROTOCOL_VOTE_THRESHOLD_PRESETS)[number]['id'];

export type ProtocolVoteQuorumRiskLevel = 'none' | 'caution' | 'high';

export interface ProtocolVoteQuorumRisk {
  level: ProtocolVoteQuorumRiskLevel;
  message: string | null;
}

export interface ProtocolVoteQuorumOption {
  quorum: string;
  nameLabel: string;
}

export function filterEditableProtocolPermissions(
  permissions: string[] | undefined
): string[] {
  return (permissions ?? []).filter((permission) =>
    EDITABLE_PERMISSION_IDS.has(permission)
  );
}

export function protocolPermissionSetsEqual(
  left: string[] | undefined,
  right: string[] | readonly string[] | undefined
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  if (a.length !== b.length) return false;
  const current = new Set(a);
  return b.every((permission) => current.has(permission));
}

export function roleHasWildcardAddProposal(
  permissions: string[] | undefined
): boolean {
  return (permissions ?? []).includes(WILDCARD_ADD_PROPOSAL_PERMISSION);
}

/** Map on-chain permissions to the granular ids shown in the permission picker. */
export function readPermissionPickerPermissions(
  permissions: string[] | undefined
): string[] {
  const editable = filterEditableProtocolPermissions(permissions);
  if (editable.length > 0) return editable;
  if (roleHasWildcardAddProposal(permissions)) {
    return [...PROTOCOL_PROPOSE_ALL_PERMISSIONS];
  }
  return [];
}

export function matchProtocolPermissionPreset(
  permissions: string[] | undefined
): ProtocolPermissionPresetId {
  const raw = permissions ?? [];
  if (
    filterEditableProtocolPermissions(raw).length === 0 &&
    roleHasWildcardAddProposal(raw)
  ) {
    return 'propose_all';
  }

  const pickerPermissions = readPermissionPickerPermissions(raw);
  if (
    protocolPermissionSetsEqual(
      pickerPermissions,
      PROTOCOL_ALL_PUBLIC_PERMISSIONS
    )
  ) {
    return 'all_public';
  }
  if (
    protocolPermissionSetsEqual(
      pickerPermissions,
      PROTOCOL_ACTIONS_ONLY_PERMISSIONS
    )
  ) {
    return 'actions_only';
  }
  return 'custom';
}

export function formatProtocolPermissionPresetLabel(
  presetId: ProtocolPermissionPresetId
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

export function resolveCouncilVotePoolSize(
  policy: ProtocolDaoPolicy | null | undefined
): number | null {
  for (const roleId of COUNCIL_VOTE_ROLE_IDS) {
    const role = findProtocolRole(policy, roleId);
    const group = role?.kind?.Group;
    if (Array.isArray(group) && group.length > 0) {
      return group.length;
    }
  }
  return null;
}

export function formatVoteThresholdFraction(
  threshold: [number, number]
): string {
  return `${threshold[0]}/${threshold[1]}`;
}

export function formatVoteThresholdOptionLabel(
  preset: (typeof PROTOCOL_VOTE_THRESHOLD_PRESETS)[number],
  threshold: [number, number] = preset.threshold
): string {
  return `${preset.nameLabel} · ${preset.percentLabel} · ${formatVoteThresholdFraction(threshold)}`;
}

export function votePolicyThresholdsEqual(
  left: [number, number] | null | undefined,
  right: [number, number] | null | undefined
): boolean {
  if (!left || !right) return false;
  return left[0] * right[1] === right[0] * left[1];
}

export function resolveVoteThresholdPresetId(
  threshold: [number, number] | null | undefined
): ProtocolVoteThresholdPresetId | null {
  if (!threshold) return null;
  return (
    PROTOCOL_VOTE_THRESHOLD_PRESETS.find((preset) =>
      votePolicyThresholdsEqual(threshold, preset.threshold)
    )?.id ?? null
  );
}

export function resolveProtocolVoteThresholdPreset(
  presetId: ProtocolVoteThresholdPresetId | null | undefined
): (typeof PROTOCOL_VOTE_THRESHOLD_PRESETS)[number] | null {
  if (!presetId) return null;
  return (
    PROTOCOL_VOTE_THRESHOLD_PRESETS.find((preset) => preset.id === presetId) ??
    null
  );
}

export function readDefaultVotePolicyThreshold(
  policy: ProtocolDaoVotePolicy | null | undefined
): [number, number] | null {
  const threshold = policy?.threshold;
  if (!Array.isArray(threshold) || threshold.length !== 2) return null;
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

export function readDefaultVotePolicyQuorum(
  policy: ProtocolDaoVotePolicy | null | undefined
): string {
  const quorum = policy?.quorum?.trim();
  if (!quorum || !/^\d+$/.test(quorum)) return '0';
  return quorum;
}

export function defaultVotePolicyThresholdsEqual(
  left: [number, number] | null | undefined,
  right: [number, number] | null | undefined
): boolean {
  if (!left || !right) return false;
  return left[0] === right[0] && left[1] === right[1];
}

export function computeRoleWeightApprovalFloor(
  threshold: [number, number],
  councilSize: number
): number {
  const [numerator, denominator] = threshold;
  if (!denominator || councilSize <= 0) return 0;
  return Math.min(
    Math.floor((numerator * councilSize) / denominator) + 1,
    councilSize
  );
}

export function resolveVoteQuorumRisk(
  quorum: string,
  councilSize: number | null
): ProtocolVoteQuorumRisk {
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
  if (quorum === 0) return 'None';
  if (councilSize != null && quorum === councilSize) return 'All council';
  if (quorum === 1) return 'At least 1 approval';
  return `At least ${quorum} approvals`;
}

export function buildProtocolQuorumPresetOptions(
  councilSize: number | null,
  threshold: [number, number] | null = null,
  ensureQuorum?: string
): ProtocolVoteQuorumOption[] {
  if (councilSize == null || councilSize <= 0) {
    return [{ quorum: '0', nameLabel: 'None' }];
  }

  const thresholdFloor =
    threshold != null
      ? computeRoleWeightApprovalFloor(threshold, councilSize)
      : 1;

  const options: ProtocolVoteQuorumOption[] = [
    { quorum: '0', nameLabel: 'None' },
  ];

  for (let quorum = 1; quorum <= councilSize; quorum += 1) {
    if (quorum < thresholdFloor) continue;
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
  const options = buildProtocolQuorumPresetOptions(
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
  option: ProtocolVoteQuorumOption
): string {
  return `${option.nameLabel} · ${option.quorum}`;
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
  // Cross-multiply equality so 1/2 and 50/100 are treated as the same rule.
  const thresholdChanged =
    nextThreshold != null &&
    !votePolicyThresholdsEqual(currentThreshold, nextThreshold);
  const quorumChanged = nextQuorum !== currentQuorum;
  return thresholdChanged || quorumChanged;
}

export function protocolPolicyRoleCount(
  policy: ProtocolDaoPolicy | null | undefined
): number {
  return policy?.roles?.filter((role) => role.name?.trim()).length ?? 0;
}

export function protocolRoleEditablePermissionBaseline(
  role: ProtocolDaoRole | null | undefined
): string[] {
  if (!role) return [];
  return readPermissionPickerPermissions(role.permissions);
}

export { GUARDIANS_ROLE_ID };
