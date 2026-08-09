'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import {
  PROTOCOL_CONTRACT_CONFIG_OPS,
  PROTOCOL_MANAGED_CONTRACTS,
  getProtocolUpgradableContracts,
  type ProtocolContractConfigOpId,
} from '@/features/protocol/protocol-contracts';
import {
  PROTOCOL_CREATE_KIND_OPTIONS,
  buildProtocolCreatePayload,
  getCreatableProtocolRoleOptions,
  type ProtocolCreateKind,
  type ProtocolProposalPayload,
} from '@/features/protocol/protocol-create';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import {
  canProposeProtocolCreateKind,
  getProtocolCreateKindBlockReason,
  isProtocolDaoGroupMember,
} from '@/features/protocol/protocol-propose-gate';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { socialToYocto } from '@/lib/social-spend-profile';

export function ProtocolCreateSheet({
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
  const upgradable = useMemo(() => getProtocolUpgradableContracts(), []);
  const [kind, setKind] = useState<ProtocolCreateKind>('signal');
  const [description, setDescription] = useState('');
  const [roleId, setRoleId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amountNear, setAmountNear] = useState('');
  const [amountSocial, setAmountSocial] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [contractId, setContractId] = useState(
    PROTOCOL_MANAGED_CONTRACTS[0]?.contractId ?? ''
  );
  const [newOwnerId, setNewOwnerId] = useState('');
  const [codeHash, setCodeHash] = useState('');
  const [authorityId, setAuthorityId] = useState(TREASURY_DAO_ACCOUNT);
  const [configOpId, setConfigOpId] =
    useState<ProtocolContractConfigOpId>('support_profile');
  const [treasuryBps, setTreasuryBps] = useState('100');
  const [seasonPoolBps, setSeasonPoolBps] = useState('0');
  const [targetBps, setTargetBps] = useState('9900');
  const [burnBps, setBurnBps] = useState('0');
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const roles = useMemo(
    () => getCreatableProtocolRoleOptions(daoPolicy),
    [daoPolicy]
  );
  const delegatedWeight = eligibility?.delegatedWeight ?? '0';
  const isGroupMember = useMemo(
    () => isProtocolDaoGroupMember(daoPolicy, accountId),
    [daoPolicy, accountId]
  );
  const availableKinds = useMemo(() => {
    if (!accountId || loadState !== 'ready') {
      return PROTOCOL_CREATE_KIND_OPTIONS;
    }
    return PROTOCOL_CREATE_KIND_OPTIONS.filter((option) =>
      canProposeProtocolCreateKind(
        daoPolicy,
        accountId,
        delegatedWeight,
        option.id
      )
    );
  }, [accountId, loadState, daoPolicy, delegatedWeight]);

  useEffect(() => {
    if (!open) {
      setKind('signal');
      setDescription('');
      setRoleId('');
      setMemberId('');
      setReceiverId('');
      setAmountNear('');
      setAmountSocial('');
      setSeasonId('');
      setContractId(PROTOCOL_MANAGED_CONTRACTS[0]?.contractId ?? '');
      setNewOwnerId('');
      setCodeHash('');
      setAuthorityId(TREASURY_DAO_ACCOUNT);
      setConfigOpId('support_profile');
      setTreasuryBps('100');
      setSeasonPoolBps('0');
      setTargetBps('9900');
      setBurnBps('0');
      setEligibility(null);
      setLoadState('idle');
      setFormError(null);
      return;
    }
    if (!daoAccountId || !accountId) {
      setEligibility(null);
      setLoadState('ready');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (cancelled) return;
        setEligibility(next);
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
  }, [open, daoAccountId, accountId]);

  useEffect(() => {
    if (!open) return;
    if (roles.length === 0) {
      setRoleId('');
      return;
    }
    setRoleId((current) =>
      current && roles.includes(current) ? current : roles[0]!
    );
  }, [open, roles]);

  useEffect(() => {
    if (!open || availableKinds.length === 0) return;
    setKind((current) =>
      availableKinds.some((option) => option.id === current)
        ? current
        : availableKinds[0]!.id
    );
  }, [open, availableKinds]);

  useEffect(() => {
    const op = PROTOCOL_CONTRACT_CONFIG_OPS.find(
      (entry) => entry.id === configOpId
    );
    if (!op) return;
    setTreasuryBps(String(op.defaults.treasuryBps));
    setSeasonPoolBps(String(op.defaults.seasonPoolBps));
    setTargetBps(String(op.defaults.targetBps));
    setBurnBps(String(op.defaults.burnBps));
  }, [configOpId]);

  const canProposeSelected =
    Boolean(accountId) &&
    loadState === 'ready' &&
    canProposeProtocolCreateKind(
      daoPolicy,
      accountId,
      delegatedWeight,
      kind
    );
  const needsStake =
    loadState === 'ready' &&
    eligibility != null &&
    !isGroupMember &&
    !eligibility.canPropose;
  const bondLabel = eligibility?.proposalBond
    ? `${yoctoToNear(eligibility.proposalBond)} NEAR`
    : null;
  const shortfall =
    eligibility && BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
      : null;
  const permissionBlock =
    loadState === 'ready' && accountId && !needsStake && !canProposeSelected
      ? getProtocolCreateKindBlockReason(kind)
      : null;

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
      primaryLabel: 'Submit proposal',
      primaryPendingLabel: 'Submitting…',
      canSubmit:
        !pending &&
        Boolean(accountId) &&
        loadState === 'ready' &&
        canProposeSelected,
      pending,
      disabled:
        pending ||
        !accountId ||
        loadState === 'loading' ||
        loadState === 'error' ||
        !canProposeSelected,
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
  ]);

  return (
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb="Propose"
      handle={daoAccountId ?? undefined}
      whisper="Pick a kind, fill the fields, submit on-chain."
      closeAriaLabel="Close propose"
      backdropLabel="Close propose"
      formId={formId}
      footerState={footerState}
    >
      <form
        id={formId}
        className="protocol-compose protocol-task-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (needsStake || pending || !accountId || !canProposeSelected) return;
          try {
            const socialYocto =
              kind === 'fund_season_pool' || kind === 'withdraw_boost_infra'
                ? socialToYocto(amountSocial.trim() || '0')
                : '';
            const payload = buildProtocolCreatePayload({
              kind,
              accountId,
              description,
              roleId,
              memberId,
              receiverId:
                kind === 'withdraw_boost_infra'
                  ? receiverId || TREASURY_DAO_ACCOUNT
                  : receiverId,
              amountYocto:
                kind === 'transfer'
                  ? nearToYocto(amountNear.trim() || '0')
                  : socialYocto,
              seasonId,
              contractId,
              newOwnerId,
              codeHash,
              authorityId,
              configOpId,
              treasuryBps: Number(treasuryBps),
              seasonPoolBps: Number(seasonPoolBps),
              targetBps: Number(targetBps),
              burnBps: Number(burnBps),
            });
            setFormError(null);
            onSubmit(payload);
          } catch (error) {
            setFormError(
              error instanceof Error
                ? error.message
                : 'Could not build proposal.'
            );
          }
        }}
      >
        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to propose.</p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Checking proposal threshold…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <p className="protocol-compose-note is-warn">
            Could not verify proposal eligibility. Close and try again.
          </p>
        ) : null}

        {needsStake ? (
          <p className="protocol-compose-note is-warn">
            Need {shortfall ?? 'more'} SOCIAL delegated to propose
            {bondLabel ? ` · bond ${bondLabel}` : ''}.
          </p>
        ) : null}

        {permissionBlock ? (
          <p className="protocol-compose-note is-warn">{permissionBlock}</p>
        ) : null}

        {eligibility && canProposeSelected && bondLabel ? (
          <p className="protocol-compose-note">Bond {bondLabel} on submit.</p>
        ) : null}

        {loadState === 'ready' &&
        accountId &&
        !needsStake &&
        availableKinds.length === 0 ? (
          <p className="protocol-compose-note is-warn">
            No proposal kinds are available for your roles on this DAO.
          </p>
        ) : null}

        <div
          className="protocol-mode-rail"
          role="tablist"
          aria-label="Proposal kind"
        >
          {availableKinds.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={kind === option.id}
              className={`protocol-board-chip${kind === option.id ? ' is-active' : ''}`}
              onClick={() => {
                setKind(option.id);
                setFormError(null);
                if (option.id === 'contract_upgrade') {
                  setContractId(upgradable[0]?.contractId ?? '');
                }
                if (option.id === 'transfer_ownership') {
                  setContractId(PROTOCOL_MANAGED_CONTRACTS[0]?.contractId ?? '');
                }
              }}
              disabled={pending || loadState === 'error'}
            >
              {option.label}
            </button>
          ))}
        </div>

        {(kind === 'join_self' ||
          kind === 'add_member' ||
          kind === 'leave_self' ||
          kind === 'remove_member') && (
          <label className="guild-field">
            <span>Role</span>
            <select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              disabled={pending || roles.length === 0}
            >
              {roles.length === 0 ? (
                <option value="">No roles available</option>
              ) : (
                roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        {(kind === 'add_member' || kind === 'remove_member') && (
          <label className="guild-field">
            <span>Member account</span>
            <input
              type="text"
              value={memberId}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="alice.near"
              onChange={(event) => setMemberId(event.target.value)}
              disabled={pending}
            />
          </label>
        )}

        {kind === 'transfer' ? (
          <>
            <label className="guild-field">
              <span>Recipient</span>
              <input
                type="text"
                value={receiverId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="alice.near"
                onChange={(event) => setReceiverId(event.target.value)}
                disabled={pending}
              />
            </label>
            <label className="guild-field">
              <span>Amount (NEAR)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountNear}
                placeholder="0"
                onChange={(event) => setAmountNear(event.target.value)}
                disabled={pending}
              />
            </label>
          </>
        ) : null}

        {kind === 'fund_season_pool' ? (
          <>
            <label className="guild-field">
              <span>Season id</span>
              <input
                type="text"
                value={seasonId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="season2"
                onChange={(event) => setSeasonId(event.target.value)}
                disabled={pending}
              />
            </label>
            <label className="guild-field">
              <span>Amount (SOCIAL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountSocial}
                placeholder="0"
                onChange={(event) => setAmountSocial(event.target.value)}
                disabled={pending}
              />
            </label>
          </>
        ) : null}

        {kind === 'withdraw_boost_infra' ? (
          <>
            <label className="guild-field">
              <span>Amount (SOCIAL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountSocial}
                placeholder="0"
                onChange={(event) => setAmountSocial(event.target.value)}
                disabled={pending}
              />
            </label>
            <label className="guild-field">
              <span>Receiver</span>
              <input
                type="text"
                value={receiverId || TREASURY_DAO_ACCOUNT}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setReceiverId(event.target.value)}
                disabled={pending}
              />
            </label>
          </>
        ) : null}

        {kind === 'set_boost_infra_authority' ? (
          <label className="guild-field">
            <span>Authority</span>
            <input
              type="text"
              value={authorityId}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setAuthorityId(event.target.value)}
              disabled={pending}
            />
          </label>
        ) : null}

        {kind === 'transfer_ownership' || kind === 'contract_upgrade' ? (
          <label className="guild-field">
            <span>Contract</span>
            <select
              value={contractId}
              onChange={(event) => setContractId(event.target.value)}
              disabled={pending}
            >
              {(kind === 'contract_upgrade'
                ? upgradable
                : PROTOCOL_MANAGED_CONTRACTS
              ).map((entry) => (
                <option key={entry.contractId} value={entry.contractId}>
                  {entry.label} · {entry.contractId}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'transfer_ownership' ? (
          <label className="guild-field">
            <span>New owner</span>
            <input
              type="text"
              value={newOwnerId}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="alice.near"
              onChange={(event) => setNewOwnerId(event.target.value)}
              disabled={pending}
            />
          </label>
        ) : null}

        {kind === 'contract_upgrade' ? (
          <label className="guild-field">
            <span>Published code hash</span>
            <input
              type="text"
              value={codeHash}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Near base58 hash"
              onChange={(event) => setCodeHash(event.target.value)}
              disabled={pending}
            />
          </label>
        ) : null}

        {kind === 'contract_config' ? (
          <>
            <label className="guild-field">
              <span>Setting</span>
              <select
                value={configOpId}
                onChange={(event) =>
                  setConfigOpId(event.target.value as ProtocolContractConfigOpId)
                }
                disabled={pending}
              >
                {PROTOCOL_CONTRACT_CONFIG_OPS.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="protocol-community-row">
              <label className="guild-field">
                <span>Treasury bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={treasuryBps}
                  onChange={(event) => setTreasuryBps(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="guild-field">
                <span>Season bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={seasonPoolBps}
                  onChange={(event) => setSeasonPoolBps(event.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="protocol-community-row">
              <label className="guild-field">
                <span>Target bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={targetBps}
                  onChange={(event) => setTargetBps(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="guild-field">
                <span>Burn bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={burnBps}
                  onChange={(event) => setBurnBps(event.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
          </>
        ) : null}

        <label className="guild-field">
          <span>{kind === 'signal' ? 'Signal' : 'Description'}</span>
          <textarea
            rows={kind === 'signal' ? 5 : 3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              kind === 'signal'
                ? 'What should the DAO decide?'
                : 'Optional rationale'
            }
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
