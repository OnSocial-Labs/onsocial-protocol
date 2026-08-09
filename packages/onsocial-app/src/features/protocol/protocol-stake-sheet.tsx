'use client';

import { useEffect, useId, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { formatSocialCompact, yoctoToSocial } from '@/lib/format-social-balance';
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
  const titleId = useId();
  const amountId = useId();
  const [mode, setMode] = useState<StakeMode>('delegate');
  const [amount, setAmount] = useState('');
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = async () => {
    if (!daoAccountId || !accountId) {
      setEligibility(null);
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    setLoadError(null);
    try {
      const next = await getProtocolGovernanceEligibility(
        accountId,
        daoAccountId
      );
      setEligibility(next);
      setAmount(defaultAmountSocial(next, mode));
      setLoadState('ready');
    } catch (error) {
      setEligibility(null);
      setLoadError(
        error instanceof Error ? error.message : 'Could not load stake position.'
      );
      setLoadState('error');
    }
  };

  useEffect(() => {
    if (!open) {
      setMode('delegate');
      setAmount('');
      setEligibility(null);
      setLoadState('idle');
      setLoadError(null);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on open/account/dao
  }, [open, daoAccountId, accountId]);

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

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
      initialDetent="peek"
      peekRatio={0.62}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close stake"
      bodyClassName="protocol-action-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Stake"
            subtitle={daoAccountId ? `@${daoAccountId}` : undefined}
            onClose={onClose}
            closeAriaLabel="Close stake"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={
              !pending &&
              Boolean(accountId) &&
              stakingReady &&
              amountOk &&
              loadState === 'ready'
            }
            disabled={
              pending ||
              !accountId ||
              !stakingReady ||
              !amountOk ||
              loadState !== 'ready'
            }
            pending={pending}
            pendingLabel={`${ctaLabel}…`}
            onClick={() => {
              if (!eligibility?.stakingContractId) return;
              if (mode === 'delegate') onDelegate(amountYocto);
              else if (mode === 'undelegate') onUndelegate([amountYocto]);
              else onWithdraw(amountYocto);
            }}
          >
            {ctaLabel}
          </OsSheetAction>
        </OsSheetActions>
      }
    >
      <div className="protocol-compose">
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
              onClick={() => void refresh()}
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
                  stake · {formatSocialCompact(eligibility.walletBalance)} wallet
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

            <label className="protocol-field" htmlFor={amountId}>
              <span>Amount (SOCIAL)</span>
              <input
                id={amountId}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                disabled={pending}
              />
            </label>
          </>
        ) : null}
      </div>
    </GlassSheet>
  );
}
