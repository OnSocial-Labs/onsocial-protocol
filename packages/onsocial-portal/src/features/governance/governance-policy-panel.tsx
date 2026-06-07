'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PenLine, RefreshCw } from 'lucide-react';
import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { PortalFieldSelect } from '@/components/ui/portal-field-select';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import {
  CompactActionSkeleton,
  StatStripSkeleton,
} from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import { fetchDaoPolicy, submitDaoProposal } from '@/features/governance/api';
import {
  buildDaoPolicyActionPayload,
  buildProtocolProposalAppId,
  canProposePolicyAction,
  canProposePolicyChange,
  DAO_ADD_ROLE_ACCESS_OPTIONS,
  DAO_POLICY_ACTION_OPTIONS,
  filterEditablePermissions,
  findDelegatedProposersRole,
  formatDaoRoleDisplayName,
  getAddRoleAccessBlockReason,
  getDaoPolicyActionHint,
  getDaoPolicyRoleOptions,
  getEditableDaoPolicyRoleOptions,
  getRemovableDaoPolicyRoleOptions,
  getRemoveDaoPolicyRoleBlockReason,
  normalizeDaoRoleNameInput,
  resolveAddRoleSourceRole,
  resolveDefaultEditablePolicyRole,
  rolePermissionsChanged,
  type DaoAddRoleAccessMode,
  type DaoPolicyActionId,
} from '@/features/governance/governance-proposal-builders';
import {
  DaoPermissionPicker,
  DaoRoleSnapshotList,
  DaoRoleSnapshotListSkeleton,
  PolicyActionForm,
  PolicyOptionalDescription,
  PolicyProposeKindPills,
  PolicyRoleListShell,
  PolicyStatusMessage,
} from '@/features/governance/governance-policy-ui';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  GOVERNANCE_DAO_ACCOUNT,
} from '@/lib/portal-config';
import {
  getGovernanceEligibility,
  getGovernanceProposalBond,
  isProposalBondWithinMax,
  isProposalPeriodDaysWithinMax,
  isValidYoctoString,
  MAX_PROPOSAL_BOND_NEAR,
  MAX_PROPOSAL_PERIOD_DAYS,
  nearToYocto,
  sanitizeNearProposalBondInput,
  sanitizeProposalPeriodDaysInput,
  tryParseYoctoBigInt,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';

const fieldLabelClass =
  'mb-2 block portal-type-label font-medium uppercase tracking-[0.16em] text-muted-foreground';

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

export function GovernancePolicyPanel() {
  const router = useRouter();
  const { accountId, connect, wallet, isConnected } = useWallet();
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
  const [bondNearInput, setBondNearInput] = useState('');
  const [periodDaysInput, setPeriodDaysInput] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [addRoleAccessMode, setAddRoleAccessMode] =
    useState<DaoAddRoleAccessMode>('custom');
  const [addRolePermissions, setAddRolePermissions] = useState<string[]>([]);
  const [targetRoleId, setTargetRoleId] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const loadContext = useCallback(async () => {
    if (!accountId) {
      setEligibility(null);
      setDaoPolicy(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [nextEligibility, bond, policy] = await Promise.all([
        getGovernanceEligibility(accountId),
        getGovernanceProposalBond(),
        fetchDaoPolicy(),
      ]);
      setEligibility(nextEligibility);
      setProposalBond(bond);
      setDaoPolicy(policy);

      const nextParameters = syncParameterInputs(policy, bond);
      setBondNearInput(nextParameters.bondNear);
      setPeriodDaysInput(nextParameters.periodDays);
    } catch {
      setEligibility(null);
      setDaoPolicy(null);
      setError('Could not load DAO policy.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setEligibility(null);
    setError('');
    void loadContext();
  }, [accountId, loadContext]);

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

  const permissionsRoleBaseline = useMemo(
    () => filterEditablePermissions(permissionsRole?.permissions),
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
          policyAction === 'add_role' ? addRoleSocialThresholdLabel : undefined,
        permissionsRoleId:
          policyAction === 'update_permissions' ? permissionsRoleId : undefined,
        onChainPermissions:
          policyAction === 'update_permissions'
            ? permissionsRoleBaseline
            : undefined,
        selectedPermissions:
          policyAction === 'update_permissions' ? selectedPermissions : undefined,
        permissionsChanged:
          policyAction === 'update_permissions' ? permissionsChanged : undefined,
        targetRoleId:
          policyAction === 'remove_role' ? targetRoleId : undefined,
      }),
    [
      addRoleAccessMode,
      addRolePermissions,
      addRoleSocialThresholdLabel,
      addRoleUsesCustomPermissions,
      normalizedNewRoleName,
      permissionsChanged,
      permissionsRoleBaseline,
      permissionsRoleId,
      policyAction,
      selectedPermissions,
      targetRoleId,
    ]
  );

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

    setSelectedPermissions(filterEditablePermissions(permissionsRole.permissions));
  }, [permissionsRole]);

  useEffect(() => {
    if (!addRoleUsesCustomPermissions) {
      setAddRolePermissions([]);
      return;
    }

    const delegatedRole = findDelegatedProposersRole(daoPolicy);
    setAddRolePermissions(filterEditablePermissions(delegatedRole?.permissions));
  }, [addRoleAccessMode, addRoleUsesCustomPermissions, daoPolicy]);

  useEffect(() => {
    if (policyAction === 'add_role' && normalizedNewRoleName) {
      setDescription(
        addRoleAccessMode === 'full_access'
          ? `Add ${normalizedNewRoleName} council role with full access.`
          : `Add ${normalizedNewRoleName} role with public permissions.`
      );
      return;
    }

    if (policyAction === 'remove_role' && targetRoleId) {
      setDescription(`Remove ${targetRoleId} from the OnSocial DAO policy.`);
      return;
    }

    if (policyAction === 'update_parameters') {
      setDescription('Update OnSocial DAO proposal bond and voting period.');
      return;
    }

    if (policyAction === 'update_permissions' && permissionsRoleId) {
      setDescription(`Update ${permissionsRoleId} permissions on the OnSocial DAO.`);
    }
  }, [
    addRoleAccessMode,
    normalizedNewRoleName,
    permissionsRoleId,
    policyAction,
    targetRoleId,
  ]);

  const isInitialLoading = loading && !daoPolicy;
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

    if (!availablePolicyActions.some((option) => option.id === policyAction)) {
      setPolicyAction(availablePolicyActions[0].id);
    }
  }, [availablePolicyActions, policyAction]);

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
      submitting
    ) {
      return false;
    }

    switch (policyAction) {
      case 'update_permissions':
        return (
          permissionsRole != null &&
          selectedPermissions.length > 0 &&
          permissionsChanged
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
    periodDaysInput,
    addRolePermissions.length,
    normalizedNewRoleName,
    parametersChanged,
    periodChanged,
    permissionsChanged,
    daoPolicy,
    permissionsRole,
    policyAction,
    removableRoleOptions.length,
    addRoleAccessMode,
    addRoleSourceRole,
    addRoleUsesCustomPermissions,
    roleOptions,
    selectedPermissions.length,
    submitting,
    targetRoleId,
  ]);

  const blockedReason = useMemo(() => {
    if (!isConnected) return 'Connect wallet to continue.';
    if (!canEditPolicy) {
      return 'Your wallet cannot propose policy changes on this DAO.';
    }
    if (!canProposeSelectedPolicyAction) {
      return 'Your wallet cannot propose this policy change on the DAO.';
    }
    if (!canCoverBond) {
      return `Add ${bondDisplay} NEAR to your wallet for the proposal bond.`;
    }
    if (policyAction === 'update_permissions') {
      if (editableRoleOptions.length === 0) {
        return 'No editable roles in DAO policy.';
      }
      if (!permissionsRole) {
        return 'Choose a role to update.';
      }
      if (selectedPermissions.length === 0) {
        return 'Select at least one permission.';
      }
      if (!permissionsChanged) {
        return 'Change permissions before submitting.';
      }
    }
    if (policyAction === 'update_parameters') {
      if (bondChanged && nextBondYocto && !isProposalBondWithinMax(nextBondYocto)) {
        return `Proposal bond cannot exceed ${MAX_PROPOSAL_BOND_NEAR} NEAR.`;
      }
      if (
        periodChanged &&
        periodDaysInput &&
        !isProposalPeriodDaysWithinMax(periodDaysInput)
      ) {
        return `Voting period cannot exceed ${MAX_PROPOSAL_PERIOD_DAYS} days.`;
      }
      if (!parametersChanged) {
        return 'Change bond or period before submitting.';
      }
    }
    if (policyAction === 'add_role') {
      if (!normalizedNewRoleName) {
        return 'Enter a valid new role name.';
      }
      if (roleOptions.includes(normalizedNewRoleName)) {
        return `Role ${normalizedNewRoleName} already exists.`;
      }
      const accessBlockReason = getAddRoleAccessBlockReason(
        daoPolicy,
        addRoleAccessMode
      );
      if (accessBlockReason) {
        return accessBlockReason;
      }
      if (addRoleUsesCustomPermissions && addRolePermissions.length === 0) {
        return 'Select at least one permission.';
      }
    }
    if (policyAction === 'remove_role') {
      if (removableRoleOptions.length === 0) {
        return 'No removable roles. Add another full-access council role before removing guardians.';
      }
      const removeBlockReason = getRemoveDaoPolicyRoleBlockReason(
        daoPolicy,
        targetRoleId
      );
      if (removeBlockReason) {
        return removeBlockReason;
      }
    }
    return '';
  }, [
    bondChanged,
    bondDisplay,
    canCoverBond,
    canEditPolicy,
    canProposeSelectedPolicyAction,
    editableRoleOptions.length,
    periodChanged,
    isConnected,
    addRolePermissions.length,
    normalizedNewRoleName,
    nextBondYocto,
    periodDaysInput,
    parametersChanged,
    permissionsChanged,
    daoPolicy,
    permissionsRole,
    policyAction,
    removableRoleOptions.length,
    addRoleAccessMode,
    addRoleUsesCustomPermissions,
    roleOptions,
    selectedPermissions.length,
    targetRoleId,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!wallet || !accountId) {
      await connect();
      return;
    }

    if (!canSubmit) {
      setError(blockedReason || 'Complete the form before submitting.');
      return;
    }

    setError('');
    clearTxResult();
    setSubmitting(true);

    try {
      const payload = buildDaoPolicyActionPayload({
        actionId: policyAction,
        policy: daoPolicy,
        description: description.trim() || undefined,
        proposalBondYocto: bondChanged ? (nextBondYocto ?? undefined) : undefined,
        proposalPeriodNs: periodChanged ? (nextPeriodNs ?? undefined) : undefined,
        newRoleName,
        addRoleAccessMode,
        targetRoleId,
        permissionsRoleId,
        permissions:
          policyAction === 'add_role' ? addRolePermissions : selectedPermissions,
      });

      const { proposalId, txHash } = await submitDaoProposal(
        wallet,
        accountId,
        payload
      );

      if (!txHash) {
        throw new Error('Proposal returned no transaction hash.');
      }

      const confirmed = await trackTransaction({
        txHashes: [txHash],
        submittedMessage: 'Submitting policy proposal…',
        successMessage: 'Policy proposal submitted.',
        failureMessage: 'Policy proposal submission failed.',
      });

      if (!confirmed) {
        return;
      }

      if (proposalId != null) {
        router.push(
          buildGovernanceProposalPath(
            buildProtocolProposalAppId(proposalId),
            proposalId
          )
        );
        return;
      }

      router.push('/governance?lane=protocol');
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
    daoPolicy,
    description,
    addRoleAccessMode,
    newRoleName,
    nextBondYocto,
    nextPeriodNs,
    periodChanged,
    permissionsRoleId,
    policyAction,
    router,
    selectedPermissions,
    setTxResult,
    targetRoleId,
    trackTransaction,
    wallet,
  ]);

  const daoAccountId =
    eligibility?.daoAccountId ?? GOVERNANCE_DAO_ACCOUNT;

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel tone="soft" className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl min-w-0">
            <SectionHeader
              badge="Policy"
              className="mb-0"
              contentClassName="max-w-2xl"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              <a
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${daoAccountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono portal-blue-text transition-colors hover:text-[var(--portal-blue)]"
              >
                @{daoAccountId}
              </a>
            </p>
          </div>
          {accountId ? (
            <div className="flex shrink-0 items-center gap-2">
              <PortalHoverTooltip tooltip="Create proposal">
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <Link href="/governance/create" aria-label="Open create proposal">
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
            </div>
          ) : null}
        </div>

        {!accountId ? (
          <div className="mt-3 border-t border-fade-detail pt-3">
            <p className="text-sm text-muted-foreground">
              Connect wallet to continue.
            </p>
            <Button
              type="button"
              className="mt-3 h-11"
              onClick={() => {
                void connect();
              }}
            >
              Connect wallet
            </Button>
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
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl">
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
              <StatStripCell label="Roles" value={String(roleCount)} size="sm" />
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
                          setError('');
                        }
                      : undefined
                  }
                />
              </PolicyRoleListShell>
              {canEditPolicy &&
              policyAction === 'update_permissions' &&
              editableRoleOptions.length > 1 ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Tap another public role to switch.
                </p>
              ) : null}
            </div>

            {canEditPolicy && availablePolicyActions.length > 0 ? (
              <div className="mt-3 space-y-3">
                <div>
                  <p className={fieldLabelClass}>Proposal kind</p>
                  <PolicyProposeKindPills
                    value={policyAction}
                    options={availablePolicyActions.map((option) => ({
                      id: option.id,
                      label: option.label,
                    }))}
                    onChange={(nextAction) => {
                      setPolicyAction(nextAction);
                      setError('');
                    }}
                  />
                </div>

                {policyAction === 'remove_role' ? (
                  <PortalFieldSelect
                    label="Remove"
                    compact
                    value={targetRoleId}
                    options={removableRoleSelectOptions}
                    disabled={removableRoleSelectOptions.length === 0}
                    placeholder="No removable roles"
                    onChange={(roleId) => {
                      setTargetRoleId(roleId);
                      setError('');
                    }}
                    ariaLabel="Role to remove"
                  />
                ) : null}

                <PolicyActionForm actionKey={policyAction}>
                  {policyAction === 'update_permissions' ? (
                    editableRoleOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No editable roles in DAO policy.
                      </p>
                    ) : (
                      <DaoPermissionPicker
                        compact
                        permissions={selectedPermissions}
                        baselinePermissions={permissionsRoleBaseline}
                        onChange={(next) => {
                          setSelectedPermissions(next);
                          setError('');
                        }}
                      />
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
                          <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-3 py-2">
                            <input
                              id="governance-policy-new-role"
                              type="text"
                              value={newRoleName}
                              onChange={(event) => {
                                setNewRoleName(event.target.value);
                                setError('');
                              }}
                              placeholder="new_role"
                              className="w-full bg-transparent font-mono text-[13px] font-medium outline-none placeholder:text-muted-foreground/50"
                            />
                          </div>
                        </div>

                        <PortalFieldSelect
                          label="Access"
                          compact
                          value={addRoleAccessMode}
                          options={addRoleAccessOptions}
                          onChange={(mode) => {
                            setAddRoleAccessMode(mode as DaoAddRoleAccessMode);
                            setError('');
                          }}
                          ariaLabel="New role access"
                          triggerClassName="py-2 text-[13px]"
                        />
                      </div>

                      {addRoleUsesCustomPermissions ? (
                        <DaoPermissionPicker
                          compact
                          permissions={addRolePermissions}
                          baselinePermissions={addRolePermissionsBaseline}
                          onChange={(next) => {
                            setAddRolePermissions(next);
                            setError('');
                          }}
                        />
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
                        <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5 md:px-4">
                          <input
                            id="governance-policy-bond"
                            type="text"
                            inputMode="decimal"
                            value={bondNearInput}
                            onChange={(event) => {
                              setBondNearInput(
                                sanitizeNearProposalBondInput(event.target.value)
                              );
                              setError('');
                            }}
                            className="w-full bg-transparent text-sm font-medium outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="governance-policy-period"
                          className={fieldLabelClass}
                        >
                          Period (days · max {MAX_PROPOSAL_PERIOD_DAYS})
                        </label>
                        <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5 md:px-4">
                          <input
                            id="governance-policy-period"
                            type="text"
                            inputMode="numeric"
                            value={periodDaysInput}
                            onChange={(event) => {
                              setPeriodDaysInput(
                                sanitizeProposalPeriodDaysInput(event.target.value)
                              );
                              setError('');
                            }}
                            className="w-full bg-transparent text-sm font-medium outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </PolicyActionForm>

                <PolicyStatusMessage
                  error={error}
                  hint={error ? undefined : policyActionHint || blockedReason}
                />

                <PolicyOptionalDescription
                  id="governance-policy-description"
                  value={description}
                  onChange={(value) => {
                    setDescription(value);
                    setError('');
                  }}
                  expanded={descriptionExpanded}
                  onToggleExpanded={() => {
                    setDescriptionExpanded((current) => !current);
                  }}
                />

                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={!canSubmit}
                  loading={submitting}
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  {selectedAction
                    ? `Propose: ${selectedAction.label}`
                    : 'Propose policy update'}
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {canEditPolicy
                  ? 'No policy proposal permissions on your delegated role.'
                  : 'Policy is view-only. Propose changes requires policy permissions on your delegated role.'}
              </p>
            )}
          </div>
        )}
      </SurfacePanel>
    </>
  );
}
