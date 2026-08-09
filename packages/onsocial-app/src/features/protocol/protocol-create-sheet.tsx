'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
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
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';
import { formatSocialCompact } from '@/lib/format-social-balance';

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
  const [kind, setKind] = useState<ProtocolCreateKind>('signal');
  const [description, setDescription] = useState('');
  const [roleId, setRoleId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amountNear, setAmountNear] = useState('');
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

  useEffect(() => {
    if (!open) {
      setKind('signal');
      setDescription('');
      setRoleId('');
      setMemberId('');
      setReceiverId('');
      setAmountNear('');
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

  const canPropose =
    loadState === 'error' ? true : eligibility?.canPropose === true;
  const needsStake =
    loadState === 'ready' && eligibility != null && !eligibility.canPropose;
  const bondLabel = eligibility?.proposalBond
    ? `${yoctoToNear(eligibility.proposalBond)} NEAR`
    : null;
  const shortfall =
    eligibility && BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
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
        loadState !== 'loading' &&
        (canPropose || loadState === 'error'),
      pending,
      disabled: pending || !accountId || loadState === 'loading',
      primaryType: 'submit',
    };
  }, [
    open,
    needsStake,
    pending,
    onOpenStake,
    accountId,
    loadState,
    canPropose,
  ]);

  return (
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb="Propose"
      handle={daoAccountId ?? undefined}
      whisper="Signal, membership, or treasury transfer on this DAO."
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
          if (needsStake || pending || !accountId) return;
          try {
            const amountYocto =
              kind === 'transfer' ? nearToYocto(amountNear.trim() || '0') : '';
            const payload = buildProtocolCreatePayload({
              kind,
              accountId,
              description,
              roleId,
              memberId,
              receiverId,
              amountYocto,
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

        {needsStake ? (
          <p className="protocol-compose-note is-warn">
            Need {shortfall ?? 'more'} SOCIAL delegated to propose
            {bondLabel ? ` · bond ${bondLabel}` : ''}.
          </p>
        ) : null}

        {eligibility && canPropose && bondLabel ? (
          <p className="protocol-compose-note">Bond {bondLabel} on submit.</p>
        ) : null}

        <div
          className="protocol-mode-rail"
          role="tablist"
          aria-label="Proposal kind"
        >
          {PROTOCOL_CREATE_KIND_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={kind === option.id}
              className={`protocol-board-chip${kind === option.id ? ' is-active' : ''}`}
              onClick={() => {
                setKind(option.id);
                setFormError(null);
              }}
              disabled={pending}
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
