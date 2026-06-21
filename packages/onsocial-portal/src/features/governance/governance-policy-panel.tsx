'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PenLine, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalConnectPrompt } from '@/components/ui/portal-connect-prompt';
import { PortalFieldSelect } from '@/components/ui/portal-field-select';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import {
  CompactActionSkeleton,
  StatStripSkeleton,
} from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  governanceCreateFieldLabelClass,
  resolveGovernancePolicyBlockedSubmitLabel,
} from '@/features/governance/governance-create-compact-ui';
import { useWallet } from '@/contexts/wallet-context';
import { fetchDaoPolicy, submitDaoProposal } from '@/features/governance/api';
import {
  buildDaoPolicyActionPayload,
  buildProtocolProposalAppId,
  canProposePolicyAction,
  canProposePolicyChange,
  DAO_ADD_ROLE_ACCESS_OPTIONS,
  DAO_POLICY_ACTION_OPTIONS,
  DAO_VOTE_THRESHOLD_PRESETS,
  filterEditablePermissions,
  findDelegatedProposersRole,
  readPermissionPickerPermissions,
  formatDaoRoleDisplayName,
  formatDefaultVotePolicyLabel,
  formatDefaultVoteQuorumLabel,
  formatVoteQuorumOptionLabel,
  formatVoteThresholdOptionLabel,
  getAddRoleAccessBlockReason,
  getDaoPolicyActionHint,
  getDaoPolicyRoleOptions,
  getEditableDaoPolicyRoleOptions,
  getRemovableDaoPolicyRoleOptions,
  getRemoveDaoPolicyRoleBlockReason,
  normalizeDaoRoleNameInput,
  readDefaultVotePolicyQuorum,
  readDefaultVotePolicyThreshold,
  readDaoRoleMemberThreshold,
  resolveAddRoleSourceRole,
  resolveCouncilVotePoolSize,
  resolveDaoVoteThresholdPreset,
  resolveDefaultEditablePolicyRole,
  resolveSelectableVoteQuorum,
  resolveVoteQuorumRisk,
  resolveVoteThresholdPresetId,
  isDaoMemberWeightRole,
  roleMemberThresholdChanged,
  rolePermissionsChanged,
  votePolicyRulesChanged,
  buildDaoQuorumPresetOptions,
  DAO_CONFIG_NAME_MAX_LENGTH,
  DAO_CONFIG_PURPOSE_MAX_LENGTH,
  daoConfigFieldsChanged,
  normalizeDaoConfigNameInput,
  normalizeDaoConfigPurposeInput,
  type DaoAddRoleAccessMode,
  type DaoPolicyActionId,
  type DaoVoteThresholdPresetId,
} from '@/features/governance/governance-proposal-builders';
import {
  buildGovernancePathWithBoard,
  resolveGovernanceDaoBoard,
} from '@/features/governance/governance-dao-board';
import {
  resolvePolicyFormValidation,
  resolvePolicySubmitFeedback,
} from '@/features/governance/governance-policy-validation';
import {
  DaoPermissionPicker,
  DaoRoleSnapshotList,
  DaoRoleSnapshotListSkeleton,
  PolicyActionForm,
  PolicyInlineFieldHint,
  PolicyProposalDescription,
  PolicyProposeKindPills,
  PolicyRoleListShell,
  policyFieldShellClass,
} from '@/features/governance/governance-policy-ui';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  GOVERNANCE_DAO_ACCOUNT,
} from '@/lib/portal-config';
import {
  getGovernanceEligibility,
  getGovernanceDaoConfig,
  getGovernanceProposalBond,
  isProposalBondWithinMax,
  isProposalPeriodDaysWithinMax,
  isValidYoctoString,
  MAX_PROPOSAL_BOND_NEAR,
  MAX_PROPOSAL_PERIOD_DAYS,
  nearToYocto,
  sanitizeNearProposalBondInput,
  sanitizeProposalPeriodDaysInput,
  sanitizeProposerThresholdSocialInput,
  isProposerThresholdWithinBounds,
  MAX_PROPOSER_THRESHOLD_SOCIAL,
  MIN_PROPOSER_THRESHOLD_SOCIAL,
  tokenAmountToSmallestUnit,
  tryParseYoctoBigInt,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';
import {
  isBoundedNoteReady,
  normalizeBoundedNote,
  POLICY_PROPOSAL_DESCRIPTION_LIMITS,
} from '@/lib/bounded-note-field';
import { cn } from '@/lib/utils';

const fieldLabelClass = governanceCreateFieldLabelClass;

const NS_PER_DAY = 86_400_000_000_000n;

function formatNear(value: string) {
  const numeric = Number(yoctoToNear(value));
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function formatSocial(value: string) {
  const numeric = Number(yoctoToSocial(value));
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function formatProposalPeriodDays(periodNs: string | undefined): string {
  if (!periodNs) return '…';
  try {
    const days = Number(BigInt(periodNs) / NS_PER_DAY);
    return `${days}d`;
  } catch {
    return '…';
  }
}

function proposalPeriodNsToDays(periodNs: string | undefined): string {
  if (!periodNs) return '';
  try {
    return (BigInt(periodNs) / NS_PER_DAY).toString();
  } catch {
    return '';
  }
}

function proposalPeriodDaysToNs(days: string): string | null {
  const normalized = days.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null;
  }

  try {
    return (BigInt(normalized) * NS_PER_DAY).toString();
  } catch {
    return null;
  }
}

function syncParameterInputs(
  policy: GovernanceDaoPolicy | null,
  fallbackBondYocto: string
) {
  return {
    bondNear: yoctoToNear(policy?.proposal_bond ?? fallbackBondYocto),
    periodDays: proposalPeriodNsToDays(policy?.proposal_period),
  };
}

function syncVotePolicyInputs(
  policy: GovernanceDaoPolicy | null,
  councilSize: number | null
): {
  thresholdPresetId: DaoVoteThresholdPresetId;
  quorumValue: string;
} {
  const threshold = readDefaultVotePolicyThreshold(policy?.default_vote_policy);
  const quorum = readDefaultVotePolicyQuorum(policy?.default_vote_policy);

  return {
    thresholdPresetId: resolveVoteThresholdPresetId(threshold) ?? 'pct_50',
    quorumValue: resolveSelectableVoteQuorum(quorum, councilSize, threshold),
  };
}

function syncDaoConfigInputs(config: Awaited<
  ReturnType<typeof getGovernanceDaoConfig>
> | null) {
  return {
    name: config?.name?.trim() ?? '',
    purpose: config?.purpose?.trim() ?? '',
    metadata: config?.metadata ?? '',
  };
}

function isDaoPolicyActionId(value: string): value is DaoPolicyActionId {
  return DAO_POLICY_ACTION_OPTIONS.some((option) => option.id === value);
}

export function GovernancePolicyPanel({
  daoAccountId = GOVERNANCE_DAO_ACCOUNT,
}: {
  daoAccountId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPolicyAction = searchParams.get('action');
  const initialPolicyActionApplied = useRef(false);
  const { accountId, connect, wallet, isConnected, isLoading: walletLoading } = useWallet();
  const { txResult, clearTxResult, setTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [eligibility, setEligibility] =
    useState<GovernanceEligibilitySnapshot | null>(null);
  const [proposalBond, setProposalBond] = useState('0');
  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [policyAction, setPolicyAction] =
    useState<DaoPolicyActionId>('update_permissions');
  const [permissionsRoleId, setPermissionsRoleId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionsMemberThresholdInput, setPermissionsMemberThresholdInput] =
    useState('');
  const [bondNearInput, setBondNearInput] = useState('');
  const [periodDaysInput, setPeriodDaysInput] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [addRoleAccessMode, setAddRoleAccessMode] =
    useState<DaoAddRoleAccessMode>('custom');
  const [addRolePermissions, setAddRolePermissions] = useState<string[]>([]);
  const [targetRoleId, setTargetRoleId] = useState('');
  const [voteThresholdPresetId, setVoteThresholdPresetId] =
    useState<DaoVoteThresholdPresetId>('pct_50');
  const [voteQuorumValue, setVoteQuorumValue] = useState('0');
  const [daoConfigNameInput, setDaoConfigNameInput] = useState('');
  const [daoConfigPurposeInput, setDaoConfigPurposeInput] = useState('');
  const [daoConfigMetadata, setDaoConfigMetadata] = useState('');
  const [currentDaoConfigName, setCurrentDaoConfigName] = useState('');
  const [currentDaoConfigPurpose, setCurrentDaoConfigPurpose] = useState('');
  const [description, setDescription] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const lastSyncedPolicyActionHintRef = useRef('');

  const clearFormFeedback = useCallback(() => {
    setError('');
    setSubmitAttempted(false);
  }, []);

  const loadContext = useCallback(async () => {
    if (!accountId) {
      setEligibility(null);
      setDaoPolicy(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [nextEligibility, bond, policy, daoConfig] = await Promise.all([
        getGovernanceEligibility(accountId, daoAccountId),
        getGovernanceProposalBond(daoAccountId),
        fetchDaoPolicy(daoAccountId),
        getGovernanceDaoConfig(daoAccountId).catch(() => null),
      ]);
      setEligibility(nextEligibility);
      setProposalBond(bond);
      setDaoPolicy(policy);

      const nextDaoConfig = syncDaoConfigInputs(daoConfig);
      setDaoConfigNameInput(nextDaoConfig.name);
      setDaoConfigPurposeInput(nextDaoConfig.purpose);
      setDaoConfigMetadata(nextDaoConfig.metadata);
      setCurrentDaoConfigName(nextDaoConfig.name);
      setCurrentDaoConfigPurpose(nextDaoConfig.purpose);

      const councilSize = resolveCouncilVotePoolSize(policy);
      const nextParameters = syncParameterInputs(policy, bond);
      setBondNearInput(nextParameters.bondNear);
      setPeriodDaysInput(nextParameters.periodDays);

      const nextVotePolicy = syncVotePolicyInputs(policy, councilSize);
      setVoteThresholdPresetId(nextVotePolicy.thresholdPresetId);
      setVoteQuorumValue(nextVotePolicy.quorumValue);
    } catch {
      setEligibility(null);
      setDaoPolicy(null);
      setError('Could not load DAO policy.');
    } finally {
      setLoading(false);
    }
  }, [accountId, daoAccountId]);

  useEffect(() => {
    setEligibility(null);
    setError('');
    initialPolicyActionApplied.current = false;
    void loadContext();
  }, [accountId, daoAccountId, loadContext]);

  const daoBoard = useMemo(
    () => resolveGovernanceDaoBoard(daoAccountId),
    [daoAccountId]
  );

  const roleOptions = useMemo(
    () => getDaoPolicyRoleOptions(daoPolicy),
    [daoPolicy]
  );

  const removableRoleOptions = useMemo(
    () => getRemovableDaoPolicyRoleOptions(daoPolicy),
    [daoPolicy]
  );

  const editableRoleOptions = useMemo(
    () => getEditableDaoPolicyRoleOptions(daoPolicy?.roles),
    [daoPolicy?.roles]
  );

  const selectedAction = useMemo(
    () =>
      DAO_POLICY_ACTION_OPTIONS.find((option) => option.id === policyAction) ??
      null,
    [policyAction]
  );

  const addRoleAccessOptions = useMemo(
    () =>
      DAO_ADD_ROLE_ACCESS_OPTIONS.map((option) => ({
        value: option.id,
        label: option.label,
        hint: option.hint,
      })),
    []
  );

  const removableRoleSelectOptions = useMemo(
    () =>
      removableRoleOptions.map((roleId) => {
        const label = formatDaoRoleDisplayName(roleId);
        return {
          value: roleId,
          label,
          hint: label !== roleId ? roleId : undefined,
        };
      }),
    [removableRoleOptions]
  );

  const permissionsRole = useMemo(
    () =>
      daoPolicy?.roles?.find(
        (role) => role.name?.trim() === permissionsRoleId
      ) ?? null,
    [daoPolicy?.roles, permissionsRoleId]
  );

  const addRoleSourceRole = useMemo(
    () => resolveAddRoleSourceRole(daoPolicy, addRoleAccessMode),
    [addRoleAccessMode, daoPolicy]
  );

  const addRoleUsesCustomPermissions = addRoleAccessMode === 'custom';

  const normalizedNewRoleName = useMemo(
    () => normalizeDaoRoleNameInput(newRoleName),
    [newRoleName]
  );

  const permissionsChanged = useMemo(
    () => rolePermissionsChanged(permissionsRole, selectedPermissions),
    [permissionsRole, selectedPermissions]
  );

  const permissionsMemberThresholdSmallest = useMemo(() => {
    if (!permissionsRole || !isDaoMemberWeightRole(permissionsRole)) {
      return null;
    }

    const normalized = permissionsMemberThresholdInput.trim();
    if (!normalized) {
      return null;
    }

    try {
      const smallest = tokenAmountToSmallestUnit(normalized, 18);
      return isProposerThresholdWithinBounds(smallest) ? smallest : null;
    } catch {
      return null;
    }
  }, [permissionsMemberThresholdInput, permissionsRole]);

  const memberThresholdChanged = useMemo(
    () =>
      roleMemberThresholdChanged(
        permissionsRole,
        permissionsMemberThresholdSmallest
      ),
    [permissionsMemberThresholdSmallest, permissionsRole]
  );

  const permissionsUpdateChanged = permissionsChanged || memberThresholdChanged;

  const permissionsRoleBaseline = useMemo(
    () => readPermissionPickerPermissions(permissionsRole?.permissions),
    [permissionsRole]
  );

  const addRolePermissionsBaseline = useMemo(() => {
    const delegatedRole = findDelegatedProposersRole(daoPolicy);
    return filterEditablePermissions(delegatedRole?.permissions);
  }, [daoPolicy]);

  const addRoleSocialThresholdLabel = useMemo(() => {
    const member = addRoleSourceRole?.kind?.Member;
    if (!member) {
      return undefined;
    }

    return formatSocial(member);
  }, [addRoleSourceRole]);

  const councilVotePoolSize = useMemo(
    () => resolveCouncilVotePoolSize(daoPolicy),
    [daoPolicy]
  );

  const usesRoleWeightVotePolicy =
    (daoPolicy?.default_vote_policy?.weight_kind ?? 'RoleWeight') ===
    'RoleWeight';

  const currentVoteThreshold = useMemo(
    () => readDefaultVotePolicyThreshold(daoPolicy?.default_vote_policy),
    [daoPolicy?.default_vote_policy]
  );

  const currentVoteQuorum = useMemo(
    () => readDefaultVotePolicyQuorum(daoPolicy?.default_vote_policy),
    [daoPolicy?.default_vote_policy]
  );

  const nextVoteThreshold = useMemo(() => {
    return (
      resolveDaoVoteThresholdPreset(voteThresholdPresetId)?.threshold ?? null
    );
  }, [voteThresholdPresetId]);

  const nextVoteQuorum = voteQuorumValue;

  const votePolicyChanged = useMemo(
    () =>
      votePolicyRulesChanged({
        currentThreshold: currentVoteThreshold,
        nextThreshold: nextVoteThreshold,
        currentQuorum: currentVoteQuorum,
        nextQuorum: nextVoteQuorum,
      }),
    [currentVoteQuorum, currentVoteThreshold, nextVoteQuorum, nextVoteThreshold]
  );

  const currentThresholdPresetId = useMemo(
    () => resolveVoteThresholdPresetId(currentVoteThreshold),
    [currentVoteThreshold]
  );

  const voteThresholdPresetOptions = useMemo(
    () =>
      DAO_VOTE_THRESHOLD_PRESETS.map((preset) => {
        const isCurrent = preset.id === currentThresholdPresetId;

        return {
          value: preset.id,
          label: formatVoteThresholdOptionLabel(
            preset,
            isCurrent
              ? (currentVoteThreshold ?? preset.threshold)
              : preset.threshold
          ),
          isCurrent,
          badge: isCurrent ? 'Current' : undefined,
        };
      }),
    [currentThresholdPresetId, currentVoteThreshold]
  );

  const voteQuorumPresetOptions = useMemo(
    () =>
      buildDaoQuorumPresetOptions(
        councilVotePoolSize,
        nextVoteThreshold ?? currentVoteThreshold,
        voteQuorumValue !== currentVoteQuorum
          ? voteQuorumValue
          : currentVoteQuorum
      ).map((option) => {
        const isCurrent = option.quorum === currentVoteQuorum;
        const risk = resolveVoteQuorumRisk(option.quorum, councilVotePoolSize);

        return {
          value: option.quorum,
          label: formatVoteQuorumOptionLabel(option),
          isCurrent,
          badge: isCurrent ? 'Current' : undefined,
          riskBadge: risk.level !== 'none' ? 'Risk' : undefined,
        };
      }),
    [
      councilVotePoolSize,
      currentVoteQuorum,
      currentVoteThreshold,
      nextVoteThreshold,
      voteQuorumValue,
    ]
  );

  const selectedVoteQuorumRisk = useMemo(
    () => resolveVoteQuorumRisk(voteQuorumValue, councilVotePoolSize),
    [councilVotePoolSize, voteQuorumValue]
  );

  useEffect(() => {
    setVoteQuorumValue((current) =>
      resolveSelectableVoteQuorum(
        current,
        councilVotePoolSize,
        nextVoteThreshold ?? currentVoteThreshold
      )
    );
  }, [councilVotePoolSize, currentVoteThreshold, nextVoteThreshold]);

  useEffect(() => {
    const defaultRole = resolveDefaultEditablePolicyRole(daoPolicy?.roles);
    setPermissionsRoleId((current) =>
      current && editableRoleOptions.includes(current) ? current : defaultRole
    );
  }, [daoPolicy?.roles, editableRoleOptions]);

  useEffect(() => {
    setTargetRoleId((current) =>
      current && removableRoleOptions.includes(current)
        ? current
        : (removableRoleOptions[0] ?? '')
    );
  }, [removableRoleOptions]);

  useEffect(() => {
    if (!permissionsRole) {
      setSelectedPermissions([]);
      return;
    }

    setSelectedPermissions(
      readPermissionPickerPermissions(permissionsRole.permissions)
    );
    const memberThreshold = readDaoRoleMemberThreshold(permissionsRole);
    setPermissionsMemberThresholdInput(
      memberThreshold ? yoctoToSocial(memberThreshold) : ''
    );
  }, [permissionsRole]);

  useEffect(() => {
    if (!addRoleUsesCustomPermissions) {
      setAddRolePermissions([]);
      return;
    }

    const delegatedRole = findDelegatedProposersRole(daoPolicy);
    setAddRolePermissions(
      filterEditablePermissions(delegatedRole?.permissions)
    );
  }, [addRoleAccessMode, addRoleUsesCustomPermissions, daoPolicy]);

  const isInitialLoading =
    walletLoading || (!!accountId && !daoPolicy && (loading || !error));
  const bondDisplay = formatNear(proposalBond);
  const periodDisplay = formatProposalPeriodDays(daoPolicy?.proposal_period);
  const roleCount = daoPolicy?.roles?.length ?? 0;
  const canEditPolicy =
    !!eligibility &&
    canProposePolicyChange(
      daoPolicy,
      accountId ?? '',
      eligibility.delegatedWeight
    );
  const availablePolicyActions = useMemo(() => {
    if (!canEditPolicy || !eligibility) {
      return [];
    }

    return DAO_POLICY_ACTION_OPTIONS.filter((option) =>
      canProposePolicyAction(
        daoPolicy,
        accountId ?? '',
        eligibility.delegatedWeight,
        option.id
      )
    );
  }, [accountId, canEditPolicy, daoPolicy, eligibility]);

  useEffect(() => {
    if (availablePolicyActions.length === 0) {
      return;
    }

    if (
      !initialPolicyActionApplied.current &&
      requestedPolicyAction &&
      isDaoPolicyActionId(requestedPolicyAction) &&
      availablePolicyActions.some(
        (option) => option.id === requestedPolicyAction
      )
    ) {
      setPolicyAction(requestedPolicyAction);
      initialPolicyActionApplied.current = true;
      return;
    }

    if (!availablePolicyActions.some((option) => option.id === policyAction)) {
      setPolicyAction(availablePolicyActions[0].id);
    }
  }, [availablePolicyActions, policyAction, requestedPolicyAction]);

  const canCoverBond =
    eligibility != null &&
    BigInt(eligibility.nearBalance) >= BigInt(proposalBond);

  const currentBondYocto = daoPolicy?.proposal_bond ?? proposalBond;
  const currentPeriodNs = daoPolicy?.proposal_period ?? '';
  const nextBondYocto = useMemo(() => {
    const normalized = bondNearInput.trim();
    if (!normalized) return null;
    try {
      const yocto = nearToYocto(normalized);
      return isValidYoctoString(yocto) ? yocto : null;
    } catch {
      return null;
    }
  }, [bondNearInput]);
  const nextPeriodNs = useMemo(
    () => proposalPeriodDaysToNs(periodDaysInput),
    [periodDaysInput]
  );
  const bondChanged =
    nextBondYocto != null && nextBondYocto !== currentBondYocto;
  const periodChanged =
    nextPeriodNs != null && nextPeriodNs !== currentPeriodNs;
  const parametersChanged = bondChanged || periodChanged;

  const normalizedConfigName = useMemo(
    () => normalizeDaoConfigNameInput(daoConfigNameInput),
    [daoConfigNameInput]
  );
  const normalizedConfigPurpose = useMemo(
    () => normalizeDaoConfigPurposeInput(daoConfigPurposeInput),
    [daoConfigPurposeInput]
  );
  const configChanged = useMemo(() => {
    if (!normalizedConfigName || !normalizedConfigPurpose) {
      return false;
    }

    return daoConfigFieldsChanged(
      {
        name: currentDaoConfigName,
        purpose: currentDaoConfigPurpose,
      },
      {
        name: normalizedConfigName,
        purpose: normalizedConfigPurpose,
      }
    );
  }, [
    currentDaoConfigName,
    currentDaoConfigPurpose,
    normalizedConfigName,
    normalizedConfigPurpose,
  ]);

  const policyActionHint = useMemo(
    () =>
      getDaoPolicyActionHint(policyAction, {
        addRoleAccessMode:
          policyAction === 'add_role' ? addRoleAccessMode : undefined,
        addRolePermissions:
          policyAction === 'add_role' && addRoleUsesCustomPermissions
            ? addRolePermissions
            : undefined,
        newRoleName:
          policyAction === 'add_role' ? normalizedNewRoleName : undefined,
        socialThresholdLabel:
          policyAction === 'add_role'
            ? addRoleSocialThresholdLabel
            : policyAction === 'update_permissions' &&
                permissionsMemberThresholdSmallest
              ? formatSocial(permissionsMemberThresholdSmallest)
              : undefined,
        permissionsRoleId:
          policyAction === 'update_permissions' ? permissionsRoleId : undefined,
        onChainPermissions:
          policyAction === 'update_permissions'
            ? permissionsRoleBaseline
            : undefined,
        selectedPermissions:
          policyAction === 'update_permissions'
            ? selectedPermissions
            : undefined,
        permissionsChanged:
          policyAction === 'update_permissions'
            ? permissionsUpdateChanged
            : undefined,
        memberThresholdChanged:
          policyAction === 'update_permissions'
            ? memberThresholdChanged
            : undefined,
        targetRoleId: policyAction === 'remove_role' ? targetRoleId : undefined,
        currentVoteThreshold:
          policyAction === 'update_vote_policy'
            ? currentVoteThreshold
            : undefined,
        nextVoteThreshold:
          policyAction === 'update_vote_policy' ? nextVoteThreshold : undefined,
        currentVoteQuorum:
          policyAction === 'update_vote_policy' ? currentVoteQuorum : undefined,
        nextVoteQuorum:
          policyAction === 'update_vote_policy' ? nextVoteQuorum : undefined,
        councilVotePoolSize:
          policyAction === 'update_vote_policy'
            ? councilVotePoolSize
            : undefined,
        votePolicyChanged:
          policyAction === 'update_vote_policy' ? votePolicyChanged : undefined,
        parametersChanged:
          policyAction === 'update_parameters' ? parametersChanged : undefined,
        bondChanged:
          policyAction === 'update_parameters' ? bondChanged : undefined,
        periodChanged:
          policyAction === 'update_parameters' ? periodChanged : undefined,
        bondNearLabel:
          policyAction === 'update_parameters' ? bondNearInput : undefined,
        periodDaysLabel:
          policyAction === 'update_parameters' ? periodDaysInput : undefined,
        configName:
          policyAction === 'update_config' ? daoConfigNameInput : undefined,
        configPurpose:
          policyAction === 'update_config' ? daoConfigPurposeInput : undefined,
        currentConfigName:
          policyAction === 'update_config' ? currentDaoConfigName : undefined,
        currentConfigPurpose:
          policyAction === 'update_config' ? currentDaoConfigPurpose : undefined,
        configChanged:
          policyAction === 'update_config' ? configChanged : undefined,
      }),
    [
      addRoleAccessMode,
      addRolePermissions,
      addRoleSocialThresholdLabel,
      addRoleUsesCustomPermissions,
      bondChanged,
      bondNearInput,
      configChanged,
      councilVotePoolSize,
      currentDaoConfigName,
      currentDaoConfigPurpose,
      currentVoteQuorum,
      currentVoteThreshold,
      daoConfigNameInput,
      daoConfigPurposeInput,
      normalizedNewRoleName,
      nextVoteQuorum,
      nextVoteThreshold,
      parametersChanged,
      periodChanged,
      periodDaysInput,
      permissionsUpdateChanged,
      memberThresholdChanged,
      permissionsMemberThresholdSmallest,
      permissionsRoleBaseline,
      permissionsRoleId,
      policyAction,
      selectedPermissions,
      targetRoleId,
      votePolicyChanged,
    ]
  );

  useEffect(() => {
    if (lastSyncedPolicyActionHintRef.current === policyActionHint) {
      return;
    }

    lastSyncedPolicyActionHintRef.current = policyActionHint;
    setDescription(policyActionHint);
  }, [policyActionHint]);

  const normalizedDescription = normalizeBoundedNote(description);
  const descriptionReady = isBoundedNoteReady(
    description,
    POLICY_PROPOSAL_DESCRIPTION_LIMITS
  );

  const canProposeSelectedPolicyAction =
    !!eligibility &&
    canProposePolicyAction(
      daoPolicy,
      accountId ?? '',
      eligibility.delegatedWeight,
      policyAction
    );

  const canSubmit = useMemo(() => {
    if (
      !isConnected ||
      !canEditPolicy ||
      !canProposeSelectedPolicyAction ||
      !canCoverBond ||
      !descriptionReady ||
      submitting
    ) {
      return false;
    }

    switch (policyAction) {
      case 'update_permissions':
        return (
          permissionsRole != null &&
          selectedPermissions.length > 0 &&
          permissionsUpdateChanged &&
          (!memberThresholdChanged ||
            permissionsMemberThresholdSmallest != null)
        );
      case 'update_parameters': {
        if (!parametersChanged) {
          return false;
        }

        if (bondChanged) {
          const bond = tryParseYoctoBigInt(nextBondYocto);
          if (
            bond == null ||
            bond <= 0n ||
            !isProposalBondWithinMax(nextBondYocto)
          ) {
            return false;
          }
        }

        if (periodChanged) {
          const period = tryParseYoctoBigInt(nextPeriodNs);
          if (
            period == null ||
            period <= 0n ||
            !isProposalPeriodDaysWithinMax(periodDaysInput)
          ) {
            return false;
          }
        }

        return true;
      }
      case 'add_role':
        return (
          normalizedNewRoleName != null &&
          !roleOptions.includes(normalizedNewRoleName) &&
          addRoleSourceRole != null &&
          getAddRoleAccessBlockReason(daoPolicy, addRoleAccessMode) === '' &&
          (addRoleUsesCustomPermissions ? addRolePermissions.length > 0 : true)
        );
      case 'remove_role':
        return (
          targetRoleId.trim().length > 0 &&
          getRemoveDaoPolicyRoleBlockReason(daoPolicy, targetRoleId) === ''
        );
      case 'update_vote_policy':
        return nextVoteThreshold != null && votePolicyChanged;
      case 'update_config':
        return (
          normalizedConfigName != null &&
          normalizedConfigPurpose != null &&
          configChanged
        );
      default:
        return false;
    }
  }, [
    bondChanged,
    canCoverBond,
    canEditPolicy,
    canProposeSelectedPolicyAction,
    isConnected,
    nextBondYocto,
    nextPeriodNs,
    nextVoteThreshold,
    periodDaysInput,
    addRolePermissions.length,
    normalizedNewRoleName,
    parametersChanged,
    periodChanged,
    permissionsUpdateChanged,
    permissionsMemberThresholdSmallest,
    memberThresholdChanged,
    daoPolicy,
    permissionsRole,
    policyAction,
    removableRoleOptions.length,
    addRoleAccessMode,
    addRoleSourceRole,
    addRoleUsesCustomPermissions,
    configChanged,
    descriptionReady,
    normalizedConfigName,
    normalizedConfigPurpose,
    roleOptions,
    selectedPermissions.length,
    submitting,
    targetRoleId,
    votePolicyChanged,
  ]);

  const { blockedReason, fieldHints } = useMemo(
    () =>
      resolvePolicyFormValidation({
        isConnected,
        canEditPolicy,
        canProposeSelectedPolicyAction,
        canCoverBond,
        bondDisplay,
        policyAction,
        submitAttempted,
        editableRoleOptionsLength: editableRoleOptions.length,
        permissionsRole,
        selectedPermissionsCount: selectedPermissions.length,
        permissionsUpdateChanged,
        memberThresholdChanged,
        permissionsMemberThresholdInput,
        permissionsMemberThresholdSmallest,
        bondChanged,
        nextBondYocto,
        periodChanged,
        periodDaysInput,
        parametersChanged,
        newRoleName,
        normalizedNewRoleName,
        roleExists:
          normalizedNewRoleName != null &&
          roleOptions.includes(normalizedNewRoleName),
        daoPolicy,
        addRoleAccessMode,
        addRoleUsesCustomPermissions,
        addRolePermissionsCount: addRolePermissions.length,
        removableRoleOptionsLength: removableRoleOptions.length,
        targetRoleId,
        nextVoteThreshold,
        votePolicyChanged,
        configNameInput: daoConfigNameInput,
        configPurposeInput: daoConfigPurposeInput,
        normalizedConfigName,
        normalizedConfigPurpose,
        configChanged,
      }),
    [
      addRoleAccessMode,
      addRolePermissions.length,
      addRoleUsesCustomPermissions,
      bondChanged,
      bondDisplay,
      canCoverBond,
      canEditPolicy,
      canProposeSelectedPolicyAction,
      configChanged,
      daoConfigNameInput,
      daoConfigPurposeInput,
      daoPolicy,
      editableRoleOptions.length,
      isConnected,
      memberThresholdChanged,
      newRoleName,
      nextBondYocto,
      nextVoteThreshold,
      normalizedConfigName,
      normalizedConfigPurpose,
      normalizedNewRoleName,
      parametersChanged,
      periodChanged,
      periodDaysInput,
      permissionsMemberThresholdInput,
      permissionsMemberThresholdSmallest,
      permissionsRole,
      permissionsUpdateChanged,
      policyAction,
      removableRoleOptions.length,
      roleOptions,
      selectedPermissions.length,
      submitAttempted,
      targetRoleId,
      votePolicyChanged,
    ]
  );

  const handleSubmit = useCallback(async () => {
    if (!wallet || !accountId) {
      await connect();
      return;
    }

    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }

    setSubmitAttempted(false);
    setError('');
    clearTxResult();
    setSubmitting(true);

    try {
      const payload = buildDaoPolicyActionPayload({
        actionId: policyAction,
        policy: daoPolicy,
        description: normalizedDescription,
        proposalBondYocto: bondChanged
          ? (nextBondYocto ?? undefined)
          : undefined,
        proposalPeriodNs: periodChanged
          ? (nextPeriodNs ?? undefined)
          : undefined,
        newRoleName,
        addRoleAccessMode,
        targetRoleId,
        permissionsRoleId,
        permissions:
          policyAction === 'add_role'
            ? addRolePermissions
            : selectedPermissions,
        memberThresholdSmallest:
          policyAction === 'update_permissions' && memberThresholdChanged
            ? (permissionsMemberThresholdSmallest ?? undefined)
            : undefined,
        votePolicyThreshold:
          policyAction === 'update_vote_policy'
            ? (nextVoteThreshold ?? undefined)
            : undefined,
        votePolicyQuorum:
          policyAction === 'update_vote_policy' ? nextVoteQuorum : undefined,
        daoConfigName:
          policyAction === 'update_config' ? daoConfigNameInput : undefined,
        daoConfigPurpose:
          policyAction === 'update_config' ? daoConfigPurposeInput : undefined,
        daoConfigMetadata:
          policyAction === 'update_config' ? daoConfigMetadata : undefined,
      });

      const targetDaoAccountId = eligibility?.daoAccountId ?? daoAccountId;
      const { proposalId, txHash } = await submitDaoProposal(
        wallet,
        accountId,
        payload,
        targetDaoAccountId
      );

      if (!txHash) {
        throw new Error('Proposal returned no transaction hash.');
      }

      const confirmed = await trackTransaction({
        txHashes: [txHash],
        submittedMessage: txToastGovPending.submittingPolicyProposal,
        successMessage: txToastGovSuccess.policyProposalSubmitted,
        failureMessage: txToastGovError.policyProposalSubmissionFailed,
      });

      if (!confirmed) {
        return;
      }

      if (proposalId != null) {
        router.push(
          buildGovernancePathWithBoard(
            buildGovernanceProposalPath(
              buildProtocolProposalAppId(proposalId),
              proposalId
            ).split('?')[0] ?? '/governance',
            daoBoard,
            {
              proposal: String(proposalId),
            }
          )
        );
        return;
      }

      router.push(
        buildGovernancePathWithBoard('/governance', daoBoard, {
          lane: 'protocol',
        })
      );
    } catch (nextError) {
      setTxResult({
        type: 'error',
        msg:
          nextError instanceof Error
            ? nextError.message
            : 'Policy proposal submission failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    accountId,
    addRolePermissions,
    blockedReason,
    bondChanged,
    canSubmit,
    clearTxResult,
    connect,
    daoAccountId,
    daoBoard,
    daoConfigMetadata,
    daoConfigNameInput,
    daoConfigPurposeInput,
    daoPolicy,
    description,
    normalizedDescription,
    addRoleAccessMode,
    eligibility,
    newRoleName,
    nextBondYocto,
    nextPeriodNs,
    nextVoteQuorum,
    nextVoteThreshold,
    periodChanged,
    permissionsRoleId,
    policyAction,
    policyActionHint,
    router,
    selectedPermissions,
    setTxResult,
    targetRoleId,
    trackTransaction,
    wallet,
  ]);

  const resolvedDaoAccountId = eligibility?.daoAccountId ?? daoAccountId;
  const showPolicyForm =
    canEditPolicy && availablePolicyActions.length > 0;
  const policyBlockedSubmitLabel = resolveGovernancePolicyBlockedSubmitLabel({
    isConnected,
    canEditPolicy,
    canCoverBond,
    bondDisplay,
    availablePolicyActionCount: availablePolicyActions.length,
    canProposeSelectedPolicyAction,
  });
  const submitLabel =
    policyBlockedSubmitLabel ??
    (selectedAction
      ? `Propose: ${selectedAction.label}`
      : 'Propose policy update');
  const submitFeedbackMessage = useMemo(
    () =>
      resolvePolicySubmitFeedback({
        error,
        blockedReason,
        fieldHints,
        submitAttempted,
      }),
    [blockedReason, error, fieldHints, submitAttempted]
  );
  const showStickyPolicySubmit = Boolean(accountId && !isInitialLoading);

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel tone="soft" className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="portal-eyebrow-wide portal-blue-text">Policy proposal</span>
            <p className="mt-2 text-xs text-muted-foreground">
              <a
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${resolvedDaoAccountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-muted-foreground/65 transition-colors hover:text-foreground/80"
              >
                @{resolvedDaoAccountId}
              </a>
            </p>
          </div>
          <div className="flex h-8 shrink-0 items-center gap-2">
            {walletLoading ? (
              <div className="h-8 w-[4.5rem] shrink-0" aria-hidden />
            ) : accountId ? (
              <>
                <PortalHoverTooltip tooltip="Create proposal">
                  <Button
                    asChild
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <Link
                      href={buildGovernancePathWithBoard(
                        '/governance/create',
                        daoBoard
                      )}
                      aria-label="Open create proposal"
                    >
                      <PenLine className="h-4 w-4" />
                    </Link>
                  </Button>
                </PortalHoverTooltip>
                <PortalHoverTooltip
                  tooltip={loading ? 'Refreshing policy' : 'Refresh policy'}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      void loadContext();
                    }}
                    disabled={loading}
                    aria-label="Refresh DAO policy"
                    className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </PortalHoverTooltip>
              </>
            ) : null}
          </div>
        </div>

        {!walletLoading && !accountId ? (
          <div className="mt-3 border-t border-fade-detail pt-3">
            <PortalConnectPrompt
              action="governance.policy"
              variant="action"
              showNavHint={false}
              onConnect={() => {
                void connect();
              }}
            />
          </div>
        ) : isInitialLoading ? (
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl border-t border-fade-detail pt-3">
            <StatStripSkeleton
              items={3}
              columns={3}
              groupClassName="mt-0"
              showTopDivider={false}
            />
            <DaoRoleSnapshotListSkeleton className="mt-3 overflow-hidden rounded-2xl border border-border/40 bg-background/45" />
            <CompactActionSkeleton className="mt-3 pt-3" />
          </div>
        ) : (
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl border-t border-fade-detail pt-3">
            <StatStrip columns={3} groupClassName="mt-0">
              <StatStripCell
                label="Bond"
                value={`${bondDisplay} NEAR`}
                showDivider
                size="sm"
              />
              <StatStripCell
                label="Period"
                value={periodDisplay}
                showDivider
                size="sm"
              />
              <StatStripCell
                label="Roles"
                value={String(roleCount)}
                size="sm"
              />
            </StatStrip>

            <div className="mt-3">
              <p className="portal-eyebrow mb-2 text-muted-foreground">Roles</p>
              <PolicyRoleListShell>
                <DaoRoleSnapshotList
                  roles={daoPolicy?.roles ?? []}
                  selectedRoleId={
                    canEditPolicy && policyAction === 'update_permissions'
                      ? permissionsRoleId
                      : undefined
                  }
                  editableRoleIds={
                    canEditPolicy && policyAction === 'update_permissions'
                      ? editableRoleOptions
                      : undefined
                  }
                  onRoleSelect={
                    canEditPolicy && policyAction === 'update_permissions'
                      ? (roleId) => {
                          setPermissionsRoleId(roleId);
                          clearFormFeedback();
                        }
                      : undefined
                  }
                />
              </PolicyRoleListShell>
            </div>

            {showPolicyForm ? (
              <div className="mt-3 space-y-3">
                <div>
                  <p className={fieldLabelClass}>Change</p>
                  <PolicyProposeKindPills
                    value={policyAction}
                    options={availablePolicyActions.map((option) => ({
                      id: option.id,
                      label: option.label,
                    }))}
                    onChange={(nextAction) => {
                      setPolicyAction(nextAction);
                      clearFormFeedback();
                    }}
                  />
                </div>

                {policyAction === 'remove_role' ? (
                  <div>
                    <PortalFieldSelect
                      label="Remove"
                      compact
                      value={targetRoleId}
                      options={removableRoleSelectOptions}
                      disabled={removableRoleSelectOptions.length === 0}
                      placeholder="No removable roles"
                      onChange={(roleId) => {
                        setTargetRoleId(roleId);
                        clearFormFeedback();
                      }}
                      ariaLabel="Role to remove"
                    />
                    <PolicyInlineFieldHint message={fieldHints.removeRole} />
                  </div>
                ) : null}

                <PolicyActionForm actionKey={policyAction}>
                  {policyAction === 'update_permissions' ? (
                    editableRoleOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No editable roles in DAO policy.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {permissionsRole &&
                        isDaoMemberWeightRole(permissionsRole) ? (
                          <div>
                            <label
                              htmlFor="governance-policy-member-threshold"
                              className={fieldLabelClass}
                            >
                              Min delegation (SOCIAL)
                            </label>
                            <div
                              className={cn(
                                policyFieldShellClass(
                                  Boolean(fieldHints.memberThreshold)
                                ),
                                'px-3 py-2'
                              )}
                            >
                              <input
                                id="governance-policy-member-threshold"
                                type="text"
                                inputMode="decimal"
                                value={permissionsMemberThresholdInput}
                                onChange={(event) => {
                                  setPermissionsMemberThresholdInput(
                                    sanitizeProposerThresholdSocialInput(
                                      event.target.value
                                    )
                                  );
                                  clearFormFeedback();
                                }}
                                placeholder="100"
                                className="w-full bg-transparent font-mono text-[13px] font-medium outline-none placeholder:text-muted-foreground/50"
                              />
                            </div>
                            <PolicyInlineFieldHint
                              message={fieldHints.memberThreshold}
                            />
                          </div>
                        ) : null}
                        <DaoPermissionPicker
                          compact
                          permissions={selectedPermissions}
                          baselinePermissions={permissionsRoleBaseline}
                          baselinePresetPermissions={
                            permissionsRole?.permissions
                          }
                          onChange={(next) => {
                            setSelectedPermissions(next);
                            clearFormFeedback();
                          }}
                        />
                        <PolicyInlineFieldHint message={fieldHints.permissions} />
                      </div>
                    )
                  ) : null}

                  {policyAction === 'add_role' ? (
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="governance-policy-new-role"
                            className={fieldLabelClass}
                          >
                            Role name
                          </label>
                          <div
                            className={cn(
                              policyFieldShellClass(
                                Boolean(fieldHints.newRoleName)
                              ),
                              'px-3 py-2'
                            )}
                          >
                            <input
                              id="governance-policy-new-role"
                              type="text"
                              value={newRoleName}
                              onChange={(event) => {
                                setNewRoleName(event.target.value);
                                clearFormFeedback();
                              }}
                              placeholder="new_role"
                              className="w-full bg-transparent font-mono text-[13px] font-medium outline-none placeholder:text-muted-foreground/50"
                            />
                          </div>
                          <PolicyInlineFieldHint message={fieldHints.newRoleName} />
                        </div>

                        <div>
                          <PortalFieldSelect
                            label="Access"
                            compact
                            value={addRoleAccessMode}
                            options={addRoleAccessOptions}
                            onChange={(mode) => {
                              setAddRoleAccessMode(mode as DaoAddRoleAccessMode);
                              clearFormFeedback();
                            }}
                            ariaLabel="New role access"
                            triggerClassName="py-2 text-[13px]"
                          />
                          <PolicyInlineFieldHint message={fieldHints.addRoleAccess} />
                        </div>
                      </div>

                      {addRoleUsesCustomPermissions ? (
                        <div>
                          <DaoPermissionPicker
                            compact
                            permissions={addRolePermissions}
                            baselinePermissions={addRolePermissionsBaseline}
                            onChange={(next) => {
                              setAddRolePermissions(next);
                              clearFormFeedback();
                            }}
                          />
                          <PolicyInlineFieldHint
                            message={fieldHints.addRolePermissions}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {policyAction === 'remove_role' &&
                  removableRoleOptions.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Guardians cannot be removed while it is the only
                      full-access role. Add a successor council role first.
                    </p>
                  ) : null}

                  {policyAction === 'update_parameters' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="governance-policy-bond"
                          className={fieldLabelClass}
                        >
                          Bond (NEAR · max {MAX_PROPOSAL_BOND_NEAR})
                        </label>
                        <div
                          className={cn(
                            policyFieldShellClass(Boolean(fieldHints.bond)),
                            'px-3 py-2.5 md:px-4'
                          )}
                        >
                          <input
                            id="governance-policy-bond"
                            type="text"
                            inputMode="decimal"
                            value={bondNearInput}
                            onChange={(event) => {
                              setBondNearInput(
                                sanitizeNearProposalBondInput(
                                  event.target.value
                                )
                              );
                              clearFormFeedback();
                            }}
                            className="w-full bg-transparent text-sm font-medium outline-none"
                          />
                        </div>
                        <PolicyInlineFieldHint message={fieldHints.bond} />
                      </div>

                      <div>
                        <label
                          htmlFor="governance-policy-period"
                          className={fieldLabelClass}
                        >
                          Period (days · max {MAX_PROPOSAL_PERIOD_DAYS})
                        </label>
                        <div
                          className={cn(
                            policyFieldShellClass(Boolean(fieldHints.period)),
                            'px-3 py-2.5 md:px-4'
                          )}
                        >
                          <input
                            id="governance-policy-period"
                            type="text"
                            inputMode="numeric"
                            value={periodDaysInput}
                            onChange={(event) => {
                              setPeriodDaysInput(
                                sanitizeProposalPeriodDaysInput(
                                  event.target.value
                                )
                              );
                              clearFormFeedback();
                            }}
                            className="w-full bg-transparent text-sm font-medium outline-none"
                          />
                        </div>
                        <PolicyInlineFieldHint message={fieldHints.period} />
                      </div>
                    </div>
                  ) : null}

                  {policyAction === 'update_config' ? (
                    <div className="space-y-2">
                      <div>
                        <label
                          htmlFor="governance-policy-config-name"
                          className={fieldLabelClass}
                        >
                          Name (max {DAO_CONFIG_NAME_MAX_LENGTH})
                        </label>
                        <div
                          className={cn(
                            policyFieldShellClass(Boolean(fieldHints.configName)),
                            'px-3 py-2.5 md:px-4'
                          )}
                        >
                          <input
                            id="governance-policy-config-name"
                            type="text"
                            value={daoConfigNameInput}
                            onChange={(event) => {
                              setDaoConfigNameInput(event.target.value);
                              clearFormFeedback();
                            }}
                            className="w-full bg-transparent text-sm font-medium outline-none"
                          />
                        </div>
                        <PolicyInlineFieldHint message={fieldHints.configName} />
                      </div>

                      <div>
                        <label
                          htmlFor="governance-policy-config-purpose"
                          className={fieldLabelClass}
                        >
                          Purpose (max {DAO_CONFIG_PURPOSE_MAX_LENGTH})
                        </label>
                        <div
                          className={cn(
                            policyFieldShellClass(
                              Boolean(fieldHints.configPurpose)
                            ),
                            'px-3 py-2.5 md:px-4'
                          )}
                        >
                          <textarea
                            id="governance-policy-config-purpose"
                            rows={4}
                            value={daoConfigPurposeInput}
                            maxLength={DAO_CONFIG_PURPOSE_MAX_LENGTH}
                            onChange={(event) => {
                              setDaoConfigPurposeInput(event.target.value);
                              clearFormFeedback();
                            }}
                            className="w-full resize-y bg-transparent text-sm font-medium leading-snug outline-none placeholder:text-muted-foreground/50"
                          />
                        </div>
                        <PolicyInlineFieldHint message={fieldHints.configPurpose} />
                      </div>
                    </div>
                  ) : null}

                  {policyAction === 'update_vote_policy' ? (
                    <div className="space-y-2">
                      <div>
                        <PortalFieldSelect
                          label="Approval threshold"
                          compact
                          value={voteThresholdPresetId}
                          options={voteThresholdPresetOptions}
                          onChange={(presetId) => {
                            setVoteThresholdPresetId(
                              presetId as DaoVoteThresholdPresetId
                            );
                            clearFormFeedback();
                          }}
                          ariaLabel="Vote approval threshold"
                        />
                        <PolicyInlineFieldHint message={fieldHints.voteThreshold} />
                      </div>

                      {usesRoleWeightVotePolicy ? (
                        <>
                          <PortalFieldSelect
                            label="Minimum approvals"
                            compact
                            value={voteQuorumValue}
                            options={voteQuorumPresetOptions}
                            onChange={(quorum) => {
                              setVoteQuorumValue(quorum);
                              clearFormFeedback();
                            }}
                            ariaLabel="Minimum approve vote floor"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Uses whichever is stricter: this floor or the
                            approval threshold.
                          </p>
                          {selectedVoteQuorumRisk.message ? (
                            <p className="text-[11px] portal-amber-text">
                              Risk: {selectedVoteQuorumRisk.message}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </PolicyActionForm>

                <PolicyProposalDescription
                  id="governance-policy-description"
                  value={description}
                  onChange={(value) => {
                    setDescription(value);
                    clearFormFeedback();
                  }}
                />

                {showStickyPolicySubmit ? (
                  <div className="sticky bottom-0 z-10 -mx-4 -mt-3 border-t border-fade-detail bg-background/92 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl md:hidden">
                    {submitFeedbackMessage ? (
                      <p className="mb-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
                        <span className={error ? 'portal-red-text' : undefined}>
                          {submitFeedbackMessage}
                        </span>
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className="h-11 w-full"
                      disabled={!canSubmit}
                      loading={submitting}
                      onClick={() => {
                        void handleSubmit();
                      }}
                    >
                      {submitLabel}
                    </Button>
                  </div>
                ) : null}

                {submitFeedbackMessage ? (
                  <p className="hidden text-sm text-muted-foreground md:block">
                    <span className={error ? 'portal-red-text' : undefined}>
                      {submitFeedbackMessage}
                    </span>
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="hidden h-11 w-full md:inline-flex"
                  disabled={!canSubmit}
                  loading={submitting}
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  {submitLabel}
                </Button>
              </div>
            ) : showStickyPolicySubmit ? (
              <>
                <div className="sticky bottom-0 z-10 -mx-4 mt-3 border-t border-fade-detail bg-background/92 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl md:hidden">
                  <Button type="button" className="h-11 w-full" disabled>
                    {submitLabel}
                  </Button>
                </div>
                <Button
                  type="button"
                  className="mt-3 hidden h-11 w-full md:inline-flex"
                  disabled
                >
                  {submitLabel}
                </Button>
              </>
            ) : null}
          </div>
        )}
      </SurfacePanel>
    </>
  );
}
