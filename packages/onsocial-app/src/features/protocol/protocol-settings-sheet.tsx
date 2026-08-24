'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  ChoiceDrawerField,
  osFieldBorderedClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { findProtocolRole } from '@/features/protocol/protocol-create';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import {
  getProtocolDaoConfig,
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import {
  PROTOCOL_ADD_ROLE_ACCESS_OPTIONS,
  PROTOCOL_EDITABLE_PERMISSIONS,
  PROTOCOL_POLICY_ACTION_OPTIONS,
  buildProtocolPolicyPayload,
  daysToProposalPeriodNs,
  getAddRoleAccessBlockReason,
  getEditableProtocolPolicyRoleOptions,
  getRemovableProtocolPolicyRoleOptions,
  proposalPeriodNsToDays,
  protocolPolicyActionLabel,
  type ProtocolAddRoleAccessMode,
  type ProtocolPolicyActionId,
} from '@/features/protocol/protocol-policy';
import {
  PROTOCOL_ACTIONS_ONLY_PERMISSIONS,
  PROTOCOL_ALL_PUBLIC_PERMISSIONS,
  PROTOCOL_VOTE_THRESHOLD_PRESETS,
  buildProtocolQuorumPresetOptions,
  formatProtocolPermissionPresetLabel,
  formatVoteQuorumOptionLabel,
  formatVoteThresholdOptionLabel,
  matchProtocolPermissionPreset,
  protocolPermissionSetsEqual,
  protocolPolicyRoleCount,
  protocolRoleEditablePermissionBaseline,
  readDefaultVotePolicyQuorum,
  readDefaultVotePolicyThreshold,
  resolveCouncilVotePoolSize,
  resolveProtocolVoteThresholdPreset,
  resolveSelectableVoteQuorum,
  resolveVoteQuorumRisk,
  resolveVoteThresholdPresetId,
  votePolicyRulesChanged,
  type ProtocolVoteThresholdPresetId,
} from '@/features/protocol/protocol-policy-presets';
import {
  getProtocolPolicyActionBlockReason,
  viewerHasPolicyActionPermission,
} from '@/features/protocol/protocol-propose-gate';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';
import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  PROTOCOL_CONFIRM_Z,
  PROTOCOL_NESTED_CHOICE_Z,
} from '@/features/protocol/protocol-sheet-z';

function tryNearToYocto(value: string): string | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return nearToYocto(trimmed);
  } catch {
    return null;
  }
}

function tryPeriodNs(value: string): string | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return daysToProposalPeriodNs(trimmed);
  } catch {
    return null;
  }
}

export function ProtocolSettingsSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  daoPolicy,
  pending,
  initialAction = 'update_vote_policy',
  onSubmit,
  onOpenStake,
  onChangeAction,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  pending: boolean;
  initialAction?: ProtocolPolicyActionId;
  onSubmit: (payload: ProtocolProposalPayload) => void;
  onOpenStake: () => void;
  /** Optional — reopen the settings action picker. */
  onChangeAction?: () => void;
}) {
  const formId = useId();
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const [actionId, setActionId] =
    useState<ProtocolPolicyActionId>(initialAction);
  const [description, setDescription] = useState('');
  const [bondNear, setBondNear] = useState('');
  const [periodDays, setPeriodDays] = useState('');
  const [baselineBondNear, setBaselineBondNear] = useState('');
  const [baselinePeriodDays, setBaselinePeriodDays] = useState('');
  const [configName, setConfigName] = useState('');
  const [configPurpose, setConfigPurpose] = useState('');
  const [baselineConfigName, setBaselineConfigName] = useState('');
  const [baselineConfigPurpose, setBaselineConfigPurpose] = useState('');
  const [voteThresholdPresetId, setVoteThresholdPresetId] =
    useState<ProtocolVoteThresholdPresetId>('pct_50');
  const [voteQuorum, setVoteQuorum] = useState('0');
  const [newRoleName, setNewRoleName] = useState('');
  const [addRoleAccessMode, setAddRoleAccessMode] =
    useState<ProtocolAddRoleAccessMode>('full_access');
  const [addRolePermissions, setAddRolePermissions] = useState<string[]>([
    'call:AddProposal',
  ]);
  const [removeRoleId, setRemoveRoleId] = useState('');
  const [permissionsRoleId, setPermissionsRoleId] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [fetchedEligibility, setFetchedEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const eligibility = face?.eligibility ?? fetchedEligibility;
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] =
    useState<ProtocolProposalPayload | null>(null);

  const editableRoles = useMemo(
    () => getEditableProtocolPolicyRoleOptions(daoPolicy),
    [daoPolicy]
  );
  const removableRoles = useMemo(
    () => getRemovableProtocolPolicyRoleOptions(daoPolicy),
    [daoPolicy]
  );
  const availableActions = useMemo(() => {
    if (!accountId || loadState !== 'ready') {
      return PROTOCOL_POLICY_ACTION_OPTIONS;
    }
    return PROTOCOL_POLICY_ACTION_OPTIONS.filter((option) =>
      viewerHasPolicyActionPermission(daoPolicy, accountId, option.id)
    );
  }, [accountId, loadState, daoPolicy]);

  const hasActionPermission = useMemo(
    () => viewerHasPolicyActionPermission(daoPolicy, accountId, actionId),
    [daoPolicy, accountId, actionId]
  );

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
  const nextVoteThreshold = useMemo(
    () =>
      resolveProtocolVoteThresholdPreset(voteThresholdPresetId)?.threshold ??
      null,
    [voteThresholdPresetId]
  );
  const currentThresholdPresetId = useMemo(
    () => resolveVoteThresholdPresetId(currentVoteThreshold),
    [currentVoteThreshold]
  );
  const votePolicyChanged = useMemo(
    () =>
      votePolicyRulesChanged({
        currentThreshold: currentVoteThreshold,
        nextThreshold: nextVoteThreshold,
        currentQuorum: currentVoteQuorum,
        nextQuorum: voteQuorum,
      }),
    [currentVoteQuorum, currentVoteThreshold, nextVoteThreshold, voteQuorum]
  );
  const selectedVoteQuorumRisk = useMemo(
    () => resolveVoteQuorumRisk(voteQuorum, councilVotePoolSize),
    [councilVotePoolSize, voteQuorum]
  );
  const voteQuorumOptions = useMemo(
    () =>
      buildProtocolQuorumPresetOptions(
        councilVotePoolSize,
        nextVoteThreshold ?? currentVoteThreshold,
        voteQuorum
      ),
    [councilVotePoolSize, currentVoteThreshold, nextVoteThreshold, voteQuorum]
  );

  const permissionsRole = useMemo(
    () => findProtocolRole(daoPolicy, permissionsRoleId),
    [daoPolicy, permissionsRoleId]
  );
  const permissionsBaseline = useMemo(
    () => protocolRoleEditablePermissionBaseline(permissionsRole),
    [permissionsRole]
  );
  const permissionsChanged = useMemo(
    () => !protocolPermissionSetsEqual(permissions, permissionsBaseline),
    [permissions, permissionsBaseline]
  );
  const matchesPermissionsBaseline = !permissionsChanged;
  const matchesAllPublic = protocolPermissionSetsEqual(
    permissions,
    PROTOCOL_ALL_PUBLIC_PERMISSIONS
  );
  const matchesActionsOnly = protocolPermissionSetsEqual(
    permissions,
    PROTOCOL_ACTIONS_ONLY_PERMISSIONS
  );
  const baselinePermissionPresetLabel = formatProtocolPermissionPresetLabel(
    matchProtocolPermissionPreset(permissionsRole?.permissions)
  );

  const nextBondYocto = tryNearToYocto(bondNear);
  const baselineBondYocto = tryNearToYocto(baselineBondNear);
  const nextPeriodNs = tryPeriodNs(periodDays);
  const baselinePeriodNs = tryPeriodNs(baselinePeriodDays);
  const bondChanged =
    nextBondYocto != null &&
    baselineBondYocto != null &&
    nextBondYocto !== baselineBondYocto;
  const periodChanged =
    nextPeriodNs != null &&
    baselinePeriodNs != null &&
    nextPeriodNs !== baselinePeriodNs;
  const parametersChanged = bondChanged || periodChanged;
  const configChanged =
    configName.trim() !== baselineConfigName.trim() ||
    configPurpose.trim() !== baselineConfigPurpose.trim();

  const noChangesYet = useMemo(() => {
    switch (actionId) {
      case 'update_parameters':
        return !parametersChanged;
      case 'update_config':
        return !configChanged;
      case 'update_vote_policy':
        return !votePolicyChanged;
      case 'update_permissions':
        return !permissionsChanged;
      case 'add_role':
        return !newRoleName.trim();
      case 'remove_role':
        return !removeRoleId.trim();
      default:
        return false;
    }
  }, [
    actionId,
    parametersChanged,
    configChanged,
    votePolicyChanged,
    permissionsChanged,
    newRoleName,
    removeRoleId,
  ]);

  const roleCount = protocolPolicyRoleCount(daoPolicy);
  const bondSummary = baselineBondNear.trim()
    ? `${baselineBondNear.trim()} NEAR`
    : '—';
  const periodSummary = baselinePeriodDays.trim()
    ? `${baselinePeriodDays.trim()}d`
    : '—';

  useEffect(() => {
    if (!open) {
      setActionId(initialAction);
      setDescription('');
      setBondNear('');
      setPeriodDays('');
      setBaselineBondNear('');
      setBaselinePeriodDays('');
      setConfigName('');
      setConfigPurpose('');
      setBaselineConfigName('');
      setBaselineConfigPurpose('');
      setVoteThresholdPresetId('pct_50');
      setVoteQuorum('0');
      setNewRoleName('');
      setAddRoleAccessMode('full_access');
      setAddRolePermissions(['call:AddProposal']);
      setRemoveRoleId('');
      setPermissionsRoleId('');
      setPermissions([]);
      setFetchedEligibility(null);
      setLoadState('idle');
      setFormError(null);
      setProposeConfirmOpen(false);
      setPendingPayload(null);
      return;
    }

    setActionId(initialAction);

    const threshold = readDefaultVotePolicyThreshold(
      daoPolicy?.default_vote_policy
    );
    const thresholdPresetId =
      resolveVoteThresholdPresetId(threshold) ?? 'pct_50';
    setVoteThresholdPresetId(thresholdPresetId);
    const nextThreshold =
      resolveProtocolVoteThresholdPreset(thresholdPresetId)?.threshold ??
      threshold;
    const quorum = readDefaultVotePolicyQuorum(daoPolicy?.default_vote_policy);
    setVoteQuorum(
      resolveSelectableVoteQuorum(
        quorum,
        resolveCouncilVotePoolSize(daoPolicy),
        nextThreshold
      )
    );

    const bond = daoPolicy?.proposal_bond
      ? yoctoToNear(daoPolicy.proposal_bond)
      : '';
    const period = proposalPeriodNsToDays(daoPolicy?.proposal_period);
    setBondNear(bond);
    setPeriodDays(period);
    setBaselineBondNear(bond);
    setBaselinePeriodDays(period);

    if (!daoAccountId) {
      setLoadState('ready');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    void Promise.all([
      face || !accountId
        ? Promise.resolve(face?.eligibility ?? null)
        : getProtocolGovernanceEligibility(accountId, daoAccountId),
      getProtocolDaoConfig(daoAccountId),
    ])
      .then(([nextEligibility, config]) => {
        if (cancelled) return;
        setFetchedEligibility(nextEligibility);
        const name = config?.name ?? '';
        const purpose = config?.purpose ?? '';
        setConfigName(name);
        setConfigPurpose(purpose);
        setBaselineConfigName(name);
        setBaselineConfigPurpose(purpose);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setFetchedEligibility(null);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  },
  // Face snapshot is read at render so this form is not reset on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- face snapshot
  [open, daoAccountId, accountId, daoPolicy, initialAction]);

  // Action is chosen in ProtocolSettingsActionSheet — only fall back if the
  // selected action is no longer permissioned for this viewer.
  useEffect(() => {
    if (!open || availableActions.length === 0) return;
    setActionId((current) =>
      availableActions.some((option) => option.id === current)
        ? current
        : availableActions[0]!.id
    );
  }, [open, availableActions]);

  useEffect(() => {
    if (!open) return;
    setRemoveRoleId((current) =>
      current && removableRoles.includes(current)
        ? current
        : (removableRoles[0] ?? '')
    );
    setPermissionsRoleId((current) =>
      current && editableRoles.includes(current)
        ? current
        : (editableRoles[0] ?? '')
    );
  }, [open, removableRoles, editableRoles]);

  useEffect(() => {
    if (!open || availableActions.length === 0) return;
    setActionId((current) =>
      availableActions.some((option) => option.id === current)
        ? current
        : availableActions[0]!.id
    );
  }, [open, availableActions]);

  useEffect(() => {
    if (!open || !permissionsRoleId) return;
    const role = findProtocolRole(daoPolicy, permissionsRoleId);
    setPermissions(protocolRoleEditablePermissionBaseline(role));
  }, [open, permissionsRoleId, daoPolicy]);

  useEffect(() => {
    if (!open || actionId !== 'update_vote_policy') return;
    setVoteQuorum((current) =>
      resolveSelectableVoteQuorum(
        current,
        councilVotePoolSize,
        nextVoteThreshold ?? currentVoteThreshold
      )
    );
  }, [
    open,
    actionId,
    councilVotePoolSize,
    nextVoteThreshold,
    currentVoteThreshold,
  ]);

  const eligibilityLoading =
    loadState === 'loading' || Boolean(face?.isLoading && !eligibility);
  const needsStake =
    !eligibilityLoading &&
    eligibility != null &&
    eligibility.hasStakeProposePath &&
    !viewerCanProposeOnDao(eligibility);
  const needsForeignStake =
    !eligibilityLoading &&
    eligibility != null &&
    Boolean(eligibility.foreignStakeTokenLabel) &&
    !viewerCanProposeOnDao(eligibility);
  const shortfall =
    eligibility && BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
      : null;
  const permissionBlock =
    loadState === 'ready' && accountId && !hasActionPermission
      ? getProtocolPolicyActionBlockReason(actionId)
      : null;
  const addRoleBlock =
    actionId === 'add_role'
      ? getAddRoleAccessBlockReason(daoPolicy, addRoleAccessMode)
      : '';

  const formReady =
    Boolean(accountId) &&
    loadState === 'ready' &&
    hasActionPermission &&
    !addRoleBlock &&
    !noChangesYet;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!open) return null;
    return {
      visible: true,
      primaryLabel: 'Propose',
      primaryPendingLabel: 'Submitting…',
      canSubmit: !pending && formReady,
      pending,
      disabled:
        pending ||
        !accountId ||
        loadState === 'loading' ||
        loadState === 'error' ||
        !hasActionPermission ||
        Boolean(addRoleBlock) ||
        noChangesYet,
      primaryType: 'submit',
    };
  }, [
    open,
    pending,
    formReady,
    accountId,
    loadState,
    hasActionPermission,
    addRoleBlock,
    noChangesYet,
  ]);

  return (
    <>
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb={protocolPolicyActionLabel(actionId)}
      handle={daoAccountId ?? undefined}
      whisper="Fill the fields, then confirm bond and submit."
      closeAriaLabel="Close settings"
      backdropLabel="Close settings"
      formId={formId}
      footerState={footerState}
    >
      <form
        id={formId}
        className="protocol-compose protocol-task-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !accountId || !formReady) {
            return;
          }
          try {
            const payload = buildProtocolPolicyPayload({
              actionId,
              policy: daoPolicy,
              description,
              proposalBondYocto: bondChanged
                ? (nextBondYocto ?? undefined)
                : undefined,
              proposalPeriodNs: periodChanged
                ? (nextPeriodNs ?? undefined)
                : undefined,
              configName,
              configPurpose,
              voteThreshold:
                actionId === 'update_vote_policy'
                  ? (nextVoteThreshold ?? undefined)
                  : undefined,
              voteQuorum: usesRoleWeightVotePolicy ? voteQuorum : undefined,
              newRoleName,
              addRoleAccessMode,
              addRolePermissions,
              removeRoleId,
              permissionsRoleId,
              permissions,
            });
            setFormError(null);
            setPendingPayload(payload);
            setProposeConfirmOpen(true);
          } catch (error) {
            setFormError(
              error instanceof Error
                ? error.message
                : 'Could not build settings proposal.'
            );
          }
        }}
      >
        {!accountId ? (
          <p className="protocol-empty">
            Connect a wallet to propose settings.
          </p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Loading DAO settings…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <p className="protocol-compose-note is-warn">
            Could not verify settings eligibility. Close and try again.
          </p>
        ) : null}

        {needsStake ? (
          <p className="protocol-compose-note is-warn">
            Need {shortfall ?? 'more'} SOCIAL delegated — you can still fill
            this form; confirm will offer Stake.
          </p>
        ) : null}

        {needsForeignStake ? (
          <p className="protocol-compose-note is-warn">
            Need {eligibility?.foreignStakeTokenLabel ?? "this DAO's token"}{' '}
            stake to propose.
          </p>
        ) : null}

        {permissionBlock ? (
          <p className="protocol-compose-note is-warn">{permissionBlock}</p>
        ) : null}

        {loadState === 'ready' &&
        accountId &&
        availableActions.length === 0 ? (
          <p className="protocol-compose-note is-warn">
            No settings actions are available for your roles on this DAO.
          </p>
        ) : null}

        {loadState === 'ready' ? (
          <div className="protocol-policy-summary" aria-label="Current policy">
            <div className="protocol-policy-summary-cell">
              <span className="protocol-policy-summary-label">Bond</span>
              <span className="protocol-policy-summary-value">
                {bondSummary}
              </span>
            </div>
            <div className="protocol-policy-summary-cell">
              <span className="protocol-policy-summary-label">Period</span>
              <span className="protocol-policy-summary-value">
                {periodSummary}
              </span>
            </div>
            <div className="protocol-policy-summary-cell">
              <span className="protocol-policy-summary-label">Roles</span>
              <span className="protocol-policy-summary-value">{roleCount}</span>
            </div>
          </div>
        ) : null}

        {onChangeAction ? (
          <div className="protocol-propose-kind-current">
            <p className="protocol-compose-note">
              {
                PROTOCOL_POLICY_ACTION_OPTIONS.find(
                  (option) => option.id === actionId
                )?.hint
              }
            </p>
            <button
              type="button"
              className="protocol-tool is-ghost"
              onClick={onChangeAction}
              disabled={pending}
            >
              Change type
            </button>
          </div>
        ) : null}

        {actionId === 'update_parameters' ? (
          <>
            <label className="guild-field">
              <span>Proposal bond (NEAR)</span>
              <input
                type="text"
                inputMode="decimal"
                value={bondNear}
                onChange={(event) => setBondNear(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
            <label className="guild-field">
              <span>Voting period (days)</span>
              <input
                type="text"
                inputMode="numeric"
                value={periodDays}
                onChange={(event) => setPeriodDays(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
          </>
        ) : null}

        {actionId === 'update_config' ? (
          <>
            <label className="guild-field">
              <span>Name</span>
              <input
                type="text"
                value={configName}
                onChange={(event) => setConfigName(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
            <label className="guild-field">
              <span>Purpose</span>
              <textarea
                rows={3}
                value={configPurpose}
                onChange={(event) => setConfigPurpose(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
          </>
        ) : null}

        {actionId === 'update_vote_policy' ? (
          <>
            <div className="guild-field">
              <ChoiceDrawerField
                label="Approval threshold"
                value={voteThresholdPresetId}
                options={PROTOCOL_VOTE_THRESHOLD_PRESETS.map(
                  (
                    preset
                  ): ChoiceOption<ProtocolVoteThresholdPresetId> => {
                    const isCurrent = preset.id === currentThresholdPresetId;
                    return {
                      value: preset.id,
                      label: formatVoteThresholdOptionLabel(
                        preset,
                        isCurrent
                          ? (currentVoteThreshold ?? preset.threshold)
                          : preset.threshold
                      ),
                      description: isCurrent ? 'Current' : undefined,
                    };
                  }
                )}
                onChange={(next) => {
                  setVoteThresholdPresetId(next);
                  setFormError(null);
                }}
                disabled={pending}
                zIndex={PROTOCOL_NESTED_CHOICE_Z}
              />
            </div>

            {usesRoleWeightVotePolicy ? (
              <>
                <div className="guild-field">
                  <ChoiceDrawerField
                    label="Minimum approvals"
                    value={voteQuorum}
                    options={voteQuorumOptions.map(
                      (option): ChoiceOption<string> => {
                        const isCurrent = option.quorum === currentVoteQuorum;
                        return {
                          value: option.quorum,
                          label: formatVoteQuorumOptionLabel(option),
                          description: isCurrent ? 'Current' : undefined,
                        };
                      }
                    )}
                    onChange={(next) => {
                      setVoteQuorum(next);
                      setFormError(null);
                    }}
                    disabled={pending}
                    hint="Uses whichever is stricter: this floor or the approval threshold."
                    zIndex={PROTOCOL_NESTED_CHOICE_Z}
                  />
                </div>
                <p className="protocol-compose-note">
                  Uses whichever is stricter: this floor or the approval
                  threshold.
                </p>
                {selectedVoteQuorumRisk.message ? (
                  <p className="protocol-compose-note is-warn">
                    Risk: {selectedVoteQuorumRisk.message}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {actionId === 'update_permissions' ? (
          <>
            {editableRoles.length === 0 ? (
              <p className="protocol-compose-note">No editable roles.</p>
            ) : (
              <div className="guild-field">
                <ChoiceDrawerField
                  label="Role"
                  value={permissionsRoleId}
                  options={editableRoles.map(
                    (role): ChoiceOption<string> => ({
                      value: role,
                      label: role,
                    })
                  )}
                  onChange={setPermissionsRoleId}
                  disabled={pending}
                  zIndex={PROTOCOL_NESTED_CHOICE_Z}
                />
              </div>
            )}

            <div
              className="protocol-preset-rail"
              role="group"
              aria-label="Permission presets"
            >
              {permissionsBaseline.length > 0 ? (
                <button
                  type="button"
                  className={`protocol-board-chip${matchesPermissionsBaseline ? ' is-active' : ''}`}
                  disabled={pending}
                  onClick={() => setPermissions([...permissionsBaseline])}
                >
                  Reset
                  <span className="sr-only">
                    {matchesPermissionsBaseline
                      ? ` · on-chain ${baselinePermissionPresetLabel}`
                      : ` · restore on-chain ${baselinePermissionPresetLabel}`}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className={`protocol-board-chip${matchesAllPublic && !matchesPermissionsBaseline ? ' is-active' : ''}`}
                disabled={pending}
                onClick={() =>
                  setPermissions([...PROTOCOL_ALL_PUBLIC_PERMISSIONS])
                }
              >
                All public
              </button>
              <button
                type="button"
                className={`protocol-board-chip${matchesActionsOnly && !matchesPermissionsBaseline ? ' is-active' : ''}`}
                disabled={pending}
                onClick={() =>
                  setPermissions([...PROTOCOL_ACTIONS_ONLY_PERMISSIONS])
                }
              >
                Actions only
              </button>
            </div>

            <div className="protocol-permission-list">
              {PROTOCOL_EDITABLE_PERMISSIONS.map((option) => {
                const checked = permissions.includes(option.id);
                const sole =
                  checked &&
                  permissions.length === 1 &&
                  permissions[0] === option.id;
                return (
                  <label key={option.id} className="protocol-permission-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending || sole}
                      onChange={() => {
                        setPermissions((current) =>
                          checked
                            ? current.filter((id) => id !== option.id)
                            : [...current, option.id]
                        );
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </>
        ) : null}

        {actionId === 'add_role' ? (
          <>
            <label className="guild-field">
              <span>New role name</span>
              <input
                type="text"
                value={newRoleName}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="reviewers"
                onChange={(event) => setNewRoleName(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
            <div className="guild-field">
              <ChoiceDrawerField
                label="Access"
                value={addRoleAccessMode}
                options={PROTOCOL_ADD_ROLE_ACCESS_OPTIONS.map(
                  (option): ChoiceOption<ProtocolAddRoleAccessMode> => ({
                    value: option.id,
                    label: option.label,
                    description: option.hint,
                  })
                )}
                onChange={setAddRoleAccessMode}
                disabled={pending}
                zIndex={PROTOCOL_NESTED_CHOICE_Z}
              />
            </div>
            <p className="protocol-compose-note">
              {
                PROTOCOL_ADD_ROLE_ACCESS_OPTIONS.find(
                  (option) => option.id === addRoleAccessMode
                )?.hint
              }
            </p>
            {addRoleAccessMode === 'custom' ? (
              <div className="protocol-permission-list">
                {PROTOCOL_EDITABLE_PERMISSIONS.map((option) => {
                  const checked = addRolePermissions.includes(option.id);
                  return (
                    <label key={option.id} className="protocol-permission-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={() => {
                          setAddRolePermissions((current) =>
                            checked
                              ? current.filter((id) => id !== option.id)
                              : [...current, option.id]
                          );
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            {addRoleBlock ? (
              <p className="protocol-compose-note is-warn">{addRoleBlock}</p>
            ) : null}
          </>
        ) : null}

        {actionId === 'remove_role' ? (
          removableRoles.length === 0 ? (
            <p className="protocol-compose-note">No removable roles.</p>
          ) : (
            <div className="guild-field">
              <ChoiceDrawerField
                label="Role"
                value={removeRoleId}
                options={removableRoles.map(
                  (role): ChoiceOption<string> => ({
                    value: role,
                    label: role,
                  })
                )}
                onChange={setRemoveRoleId}
                disabled={pending}
                zIndex={PROTOCOL_NESTED_CHOICE_Z}
              />
            </div>
          )
        ) : null}

        <label className="guild-field">
          <span>Description</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional rationale"
            disabled={pending}
            className={osFieldBorderedClassName}
          />
        </label>

        {noChangesYet &&
        loadState === 'ready' &&
        accountId &&
        hasActionPermission ? (
          <p className="protocol-compose-note">No changes yet.</p>
        ) : null}

        {formError ? (
          <p className="protocol-compose-note is-warn">{formError}</p>
        ) : null}
      </form>
    </ProtocolTaskSheet>
    <DaoProposeConfirmSheet
      open={proposeConfirmOpen}
      title={`Propose ${protocolPolicyActionLabel(actionId)}?`}
      body="Submit this settings proposal to the DAO. It goes live after approval."
      eligibility={eligibility}
      eligibilityLoading={eligibilityLoading}
      pending={pending}
      proposeLabel="Propose"
      zIndex={PROTOCOL_CONFIRM_Z}
      onDiscard={() => {
        setProposeConfirmOpen(false);
        setPendingPayload(null);
      }}
      onPropose={() => {
        if (!pendingPayload) return;
        onSubmit(pendingPayload);
      }}
      onStake={() => {
        setProposeConfirmOpen(false);
        setPendingPayload(null);
        onOpenStake();
      }}
    />
    </>
  );
}
