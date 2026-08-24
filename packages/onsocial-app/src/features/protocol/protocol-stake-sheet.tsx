'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { osFieldBorderedClassName } from '@onsocial/ui';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import { yoctoToNear } from '@/lib/app-near-rpc';
import {
  formatSocialCompact,
  yoctoToSocial,
} from '@/lib/format-social-balance';
import { socialToYocto } from '@/lib/social-spend-profile';

type StakeMode = 'delegate' | 'undelegate' | 'withdraw';

function defaultAmountSocial(
  eligibility: ProtocolGovernanceEligibility | null,
  mode: StakeMode
): string {
  if (!eligibility) return '';
  if (mode === 'delegate') {
    const need = BigInt(eligibility.remainingToThreshold || '0');
    return need > 0n ? yoctoToSocial(need.toString()) : '';
  }
  if (mode === 'undelegate') {
    const self = BigInt(eligibility.selfDelegatedWeight || '0');
    return self > 0n ? yoctoToSocial(self.toString()) : '';
  }
  const withdraw = BigInt(eligibility.availableToWithdraw || '0');
  return withdraw > 0n ? yoctoToSocial(withdraw.toString()) : '';
}

export function ProtocolStakeSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  pending,
  onDelegate,
  onUndelegate,
  onWithdraw,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  pending: boolean;
  onDelegate: (amountYocto: string) => void;
  onUndelegate: (amounts: string[]) => void;
  onWithdraw: (amountYocto: string) => void;
}) {
  const formId = useId();
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const [mode, setMode] = useState<StakeMode>('delegate');
  const [amount, setAmount] = useState('');
  const [fetchedEligibility, setFetchedEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const eligibility = face?.eligibility ?? fetchedEligibility;
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async (opts?: { fresh?: boolean }) => {
    if (!daoAccountId || !accountId) {
      setFetchedEligibility(null);
      setLoadState('ready');
      return;
    }
    if (face && !opts?.fresh) {
      setFetchedEligibility(face.eligibility);
      setAmount(defaultAmountSocial(face.eligibility, mode));
      setLoadState(face.isLoading && !face.eligibility ? 'loading' : 'ready');
      return;
    }
    setLoadState('loading');
    setLoadError(null);
    try {
      const next = face
        ? await face.refresh({ fresh: true })
        : await getProtocolGovernanceEligibility(accountId, daoAccountId, {
            fresh: true,
          });
      setFetchedEligibility(next);
      setAmount(defaultAmountSocial(next, mode));
      setLoadState('ready');
    } catch (error) {
      setFetchedEligibility(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load stake position.'
      );
      setLoadState('error');
    }
  };

  useEffect(() => {
    if (!open) {
      setMode('delegate');
      setAmount('');
      setFetchedEligibility(null);
      setLoadState('idle');
      setLoadError(null);
      setFormError(null);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on open/account/dao/face
  }, [open, daoAccountId, accountId, face]);

  useEffect(() => {
    if (!open || !eligibility) return;
    setAmount(defaultAmountSocial(eligibility, mode));
  }, [mode, open, eligibility]);

  const amountYocto = (() => {
    try {
      return socialToYocto(amount.trim() || '0');
    } catch {
      return '0';
    }
  })();
  const amountOk = BigInt(amountYocto) > 0n;
  const stakingReady = Boolean(eligibility?.stakingContractId);
  const ctaLabel =
    mode === 'delegate'
      ? 'Delegate'
      : mode === 'undelegate'
        ? 'Undelegate'
        : 'Withdraw';

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!open) return null;
    return {
      visible: true,
      primaryLabel: ctaLabel,
      primaryPendingLabel: `${ctaLabel}…`,
      canSubmit:
        !pending &&
        Boolean(accountId) &&
        stakingReady &&
        amountOk &&
        loadState === 'ready',
      pending,
      disabled:
        pending ||
        !accountId ||
        !stakingReady ||
        !amountOk ||
        loadState !== 'ready',
      primaryType: 'submit',
    };
  }, [open, ctaLabel, pending, accountId, stakingReady, amountOk, loadState]);

  return (
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb="Stake"
      handle={daoAccountId ?? undefined}
      whisper="Delegate SOCIAL to meet the proposal threshold."
      closeAriaLabel="Close stake"
      backdropLabel="Close stake"
      formId={formId}
      footerState={footerState}
    >
      <form
        id={formId}
        className="protocol-compose protocol-task-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!eligibility?.stakingContractId || !amountOk || pending) return;
          setFormError(null);
          try {
            if (mode === 'delegate') onDelegate(amountYocto);
            else if (mode === 'undelegate') onUndelegate([amountYocto]);
            else onWithdraw(amountYocto);
          } catch (error) {
            setFormError(
              error instanceof Error ? error.message : 'Could not submit.'
            );
          }
        }}
      >
        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to stake.</p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Loading stake position…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <div className="protocol-empty">
            <p>{loadError || 'Could not load stake position.'}</p>
            <button
              type="button"
              className="protocol-retry"
              onClick={() => void refresh({ fresh: true })}
            >
              Retry
            </button>
          </div>
        ) : null}

        {eligibility && !eligibility.stakingContractId ? (
          <p className="protocol-empty">
            This DAO has no staking contract wired for delegation.
          </p>
        ) : null}

        {eligibility?.stakingContractId ? (
          <>
            <dl className="protocol-action-facts">
              <div>
                <dt>Threshold</dt>
                <dd>
                  {formatSocialCompact(eligibility.requiredWeight)} SOCIAL
                </dd>
              </div>
              <div>
                <dt>Delegated</dt>
                <dd>
                  {formatSocialCompact(eligibility.delegatedWeight)} SOCIAL
                  {eligibility.canPropose ? ' · can propose' : ''}
                </dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>
                  {formatSocialCompact(eligibility.availableToDelegate)} in
                  stake · {formatSocialCompact(eligibility.walletBalance)}{' '}
                  wallet
                </dd>
              </div>
              <div>
                <dt>NEAR</dt>
                <dd>{yoctoToNear(eligibility.nearBalance)} spendable</dd>
              </div>
            </dl>

            <div
              className="protocol-mode-rail"
              role="tablist"
              aria-label="Stake action"
            >
              {(
                [
                  ['delegate', 'Delegate'],
                  ['undelegate', 'Undelegate'],
                  ['withdraw', 'Withdraw'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  className={`protocol-board-chip${mode === value ? ' is-active' : ''}`}
                  onClick={() => setMode(value)}
                  disabled={pending}
                >
                  {label}
                </button>
              ))}
            </div>

            {eligibility.isInCooldown && mode !== 'delegate' ? (
              <p className="protocol-compose-note is-warn">
                Cooldown active — withdraw may be locked until it ends.
              </p>
            ) : null}

            <label className="guild-field">
              <span>Amount (SOCIAL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
          </>
        ) : null}

        {formError ? (
          <p className="protocol-compose-note is-warn">{formError}</p>
        ) : null}
      </form>
    </ProtocolTaskSheet>
  );
}
