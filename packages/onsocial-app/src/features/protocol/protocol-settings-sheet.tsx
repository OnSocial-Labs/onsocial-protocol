'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { findProtocolRole } from '@/features/protocol/protocol-create';
import {
  getProtocolDaoConfig,
  getProtocolGovernanceEligibility,
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
  parseVoteThresholdInputs,
  proposalPeriodNsToDays,
  type ProtocolAddRoleAccessMode,
  type ProtocolPolicyActionId,
} from '@/features/protocol/protocol-policy';
import {
  canProposeProtocolPolicyAction,
  getProtocolPolicyActionBlockReason,
  isProtocolDaoGroupMember,
} from '@/features/protocol/protocol-propose-gate';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';
import { formatSocialCompact } from '@/lib/format-social-balance';

export function ProtocolSettingsSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  daoPolicy,
  pending,
  onSubmit,
  onOpenStake,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  pending: boolean;
  onSubmit: (payload: ProtocolProposalPayload) => void;
  onOpenStake: () => void;
}) {
  const formId = useId();
  const [actionId, setActionId] =
    useState<ProtocolPolicyActionId>('update_parameters');
  const [description, setDescription] = useState('');
  const [bondNear, setBondNear] = useState('');
  const [periodDays, setPeriodDays] = useState('');
  const [configName, setConfigName] = useState('');
  const [configPurpose, setConfigPurpose] = useState('');
  const [voteNum, setVoteNum] = useState('1');
  const [voteDen, setVoteDen] = useState('2');
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
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const editableRoles = useMemo(
    () => getEditableProtocolPolicyRoleOptions(daoPolicy),
    [daoPolicy]
  );
  const removableRoles = useMemo(
    () => getRemovableProtocolPolicyRoleOptions(daoPolicy),
    [daoPolicy]
  );
  const delegatedWeight = eligibility?.delegatedWeight ?? '0';
  const isGroupMember = useMemo(
    () => isProtocolDaoGroupMember(daoPolicy, accountId),
    [daoPolicy, accountId]
  );
  const availableActions = useMemo(() => {
    if (!accountId || loadState !== 'ready') {
      return PROTOCOL_POLICY_ACTION_OPTIONS;
    }
    return PROTOCOL_POLICY_ACTION_OPTIONS.filter((option) =>
      canProposeProtocolPolicyAction(
        daoPolicy,
        accountId,
        delegatedWeight,
        option.id
      )
    );
  }, [accountId, loadState, daoPolicy, delegatedWeight]);

  useEffect(() => {
    if (!open) {
      setActionId('update_parameters');
      setDescription('');
      setBondNear('');
      setPeriodDays('');
      setConfigName('');
      setConfigPurpose('');
      setVoteNum('1');
      setVoteDen('2');
      setVoteQuorum('0');
      setNewRoleName('');
      setAddRoleAccessMode('full_access');
      setAddRolePermissions(['call:AddProposal']);
      setRemoveRoleId('');
      setPermissionsRoleId('');
      setPermissions([]);
      setEligibility(null);
      setLoadState('idle');
      setFormError(null);
      return;
    }

    const threshold = daoPolicy?.default_vote_policy?.threshold;
    if (Array.isArray(threshold) && threshold.length >= 2) {
      setVoteNum(String(threshold[0]));
      setVoteDen(String(threshold[1]));
    }
    setVoteQuorum(daoPolicy?.default_vote_policy?.quorum ?? '0');
    if (daoPolicy?.proposal_bond) {
      setBondNear(yoctoToNear(daoPolicy.proposal_bond));
    }
    setPeriodDays(proposalPeriodNsToDays(daoPolicy?.proposal_period));

    if (!daoAccountId) {
      setLoadState('ready');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    void Promise.all([
      accountId
        ? getProtocolGovernanceEligibility(accountId, daoAccountId)
        : Promise.resolve(null),
      getProtocolDaoConfig(daoAccountId),
    ])
      .then(([nextEligibility, config]) => {
        if (cancelled) return;
        setEligibility(nextEligibility);
        if (config) {
          setConfigName(config.name ?? '');
          setConfigPurpose(config.purpose ?? '');
        }
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setEligibility(null);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, accountId, daoPolicy]);

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
    const current = (role?.permissions ?? []).filter((permission) =>
      PROTOCOL_EDITABLE_PERMISSIONS.some((option) => option.id === permission)
    );
    setPermissions(current);
  }, [open, permissionsRoleId, daoPolicy]);

  const canProposeSelected =
    Boolean(accountId) &&
    loadState === 'ready' &&
    canProposeProtocolPolicyAction(
      daoPolicy,
      accountId,
      delegatedWeight,
      actionId
    );
  const needsStake =
    loadState === 'ready' &&
    eligibility != null &&
    !isGroupMember &&
    !eligibility.canPropose;
  const shortfall =
    eligibility && BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
      : null;
  const permissionBlock =
    loadState === 'ready' && accountId && !needsStake && !canProposeSelected
      ? getProtocolPolicyActionBlockReason(actionId)
      : null;
  const addRoleBlock =
    actionId === 'add_role'
      ? getAddRoleAccessBlockReason(daoPolicy, addRoleAccessMode)
      : '';

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!open) return null;
    if (needsStake) {
      return {
        visible: true,
        primaryLabel: 'Stake to propose',
        primaryPendingLabel: 'Opening…',
        canSubmit: !pending,
        pending: false,
        primaryType: 'button',
        onPrimaryClick: onOpenStake,
      };
    }
    return {
      visible: true,
      primaryLabel: 'Submit settings proposal',
      primaryPendingLabel: 'Submitting…',
      canSubmit:
        !pending &&
        Boolean(accountId) &&
        loadState === 'ready' &&
        canProposeSelected &&
        !addRoleBlock,
      pending,
      disabled:
        pending ||
        !accountId ||
        loadState === 'loading' ||
        loadState === 'error' ||
        !canProposeSelected ||
        Boolean(addRoleBlock),
      primaryType: 'submit',
    };
  }, [
    open,
    needsStake,
    pending,
    onOpenStake,
    accountId,
    loadState,
    canProposeSelected,
    addRoleBlock,
  ]);

  return (
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb="Settings"
      handle={daoAccountId ?? undefined}
      whisper="Propose DAO policy and config changes."
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
          if (
            needsStake ||
            pending ||
            !accountId ||
            !canProposeSelected ||
            addRoleBlock
          ) {
            return;
          }
          try {
            const payload = buildProtocolPolicyPayload({
              actionId,
              policy: daoPolicy,
              description,
              proposalBondYocto: bondNear.trim()
                ? nearToYocto(bondNear.trim())
                : undefined,
              proposalPeriodNs: periodDays.trim()
                ? daysToProposalPeriodNs(periodDays)
                : undefined,
              configName,
              configPurpose,
              voteThreshold:
                actionId === 'update_vote_policy'
                  ? parseVoteThresholdInputs(voteNum, voteDen)
                  : undefined,
              voteQuorum,
              newRoleName,
              addRoleAccessMode,
              addRolePermissions,
              removeRoleId,
              permissionsRoleId,
              permissions,
            });
            setFormError(null);
            onSubmit(payload);
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
          <p className="protocol-empty">Connect a wallet to propose settings.</p>
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
            Need {shortfall ?? 'more'} SOCIAL delegated to propose settings.
          </p>
        ) : null}

        {permissionBlock ? (
          <p className="protocol-compose-note is-warn">{permissionBlock}</p>
        ) : null}

        {loadState === 'ready' &&
        accountId &&
        !needsStake &&
        availableActions.length === 0 ? (
          <p className="protocol-compose-note is-warn">
            No settings actions are available for your roles on this DAO.
          </p>
        ) : null}

        <div
          className="protocol-mode-rail"
          role="tablist"
          aria-label="Settings action"
        >
          {availableActions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={actionId === option.id}
              className={`protocol-board-chip${actionId === option.id ? ' is-active' : ''}`}
              onClick={() => {
                setActionId(option.id);
                setFormError(null);
              }}
              disabled={pending || loadState === 'error'}
            >
              {option.label}
            </button>
          ))}
        </div>

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
              />
            </label>
            <label className="guild-field">
              <span>Purpose</span>
              <textarea
                rows={3}
                value={configPurpose}
                onChange={(event) => setConfigPurpose(event.target.value)}
                disabled={pending}
              />
            </label>
          </>
        ) : null}

        {actionId === 'update_vote_policy' ? (
          <>
            <div className="protocol-community-row">
              <label className="guild-field">
                <span>Threshold</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={voteNum}
                  onChange={(event) => setVoteNum(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="guild-field">
                <span>of</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={voteDen}
                  onChange={(event) => setVoteDen(event.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <label className="guild-field">
              <span>Quorum (approve floor)</span>
              <input
                type="text"
                inputMode="numeric"
                value={voteQuorum}
                onChange={(event) => setVoteQuorum(event.target.value)}
                disabled={pending}
              />
            </label>
          </>
        ) : null}

        {actionId === 'update_permissions' ? (
          <>
            <label className="guild-field">
              <span>Role</span>
              <select
                value={permissionsRoleId}
                onChange={(event) => setPermissionsRoleId(event.target.value)}
                disabled={pending || editableRoles.length === 0}
              >
                {editableRoles.length === 0 ? (
                  <option value="">No editable roles</option>
                ) : (
                  editableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="protocol-permission-list">
              {PROTOCOL_EDITABLE_PERMISSIONS.map((option) => {
                const checked = permissions.includes(option.id);
                return (
                  <label key={option.id} className="protocol-permission-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
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
              />
            </label>
            <label className="guild-field">
              <span>Access</span>
              <select
                value={addRoleAccessMode}
                onChange={(event) =>
                  setAddRoleAccessMode(
                    event.target.value as ProtocolAddRoleAccessMode
                  )
                }
                disabled={pending}
              >
                {PROTOCOL_ADD_ROLE_ACCESS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
          <label className="guild-field">
            <span>Role</span>
            <select
              value={removeRoleId}
              onChange={(event) => setRemoveRoleId(event.target.value)}
              disabled={pending || removableRoles.length === 0}
            >
              {removableRoles.length === 0 ? (
                <option value="">No removable roles</option>
              ) : (
                removableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}

        <label className="guild-field">
          <span>Description</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional rationale"
            disabled={pending}
          />
        </label>

        {formError ? (
          <p className="protocol-compose-note is-warn">{formError}</p>
        ) : null}
      </form>
    </ProtocolTaskSheet>
  );
}
