'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AmountField,
  AmountFieldMetaRow,
  TokenIcon,
} from '@onsocial/ui';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import {
  applyProtocolStakeAmountInput,
  defaultProtocolStakeAmountInput,
  finalizeProtocolStakeAmountInput,
  formatProtocolStakeMaxAmount,
  parseProtocolStakeAmountYocto,
  protocolStakeActionBlocked,
  protocolStakeAmountError,
  protocolStakeAmountMeta,
  protocolStakeShowsAmountField,
  protocolStakeWhisper,
  resolveProtocolStakeMaxYocto,
  type ProtocolStakeMode,
} from '@/features/protocol/protocol-stake-amount';
import { ProtocolStakeFacts } from '@/features/protocol/protocol-stake-facts';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { yoctoToSocial } from '@/lib/format-social-balance';
import { SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS } from '@/lib/social-spend-profile';

type StakeMode = ProtocolStakeMode;

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
  const socialIcon = useSocialTokenIcon();
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
      setAmount(defaultProtocolStakeAmountInput(face.eligibility, mode));
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
      setAmount(defaultProtocolStakeAmountInput(next, mode));
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
    void refresh({ fresh: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on open/account/dao
  }, [open, daoAccountId, accountId]);

  useEffect(() => {
    if (!open || !eligibility) return;
    setAmount(defaultProtocolStakeAmountInput(eligibility, mode));
  }, [open, eligibility, mode]);

  const selectMode = useCallback(
    (next: StakeMode) => {
      setMode(next);
      setFormError(null);
      if (eligibility) {
        setAmount(defaultProtocolStakeAmountInput(eligibility, next));
      }
    },
    [eligibility]
  );

  const maxYocto = useMemo(
    () =>
      eligibility ? resolveProtocolStakeMaxYocto(eligibility, mode) : 0n,
    [eligibility, mode]
  );

  const applyAmountInput = useCallback(
    (raw: string) => {
      setFormError(null);
      setAmount(applyProtocolStakeAmountInput(raw, maxYocto));
    },
    [maxYocto]
  );

  const normalizedAmount = useMemo(
    () => finalizeProtocolStakeAmountInput(amount),
    [amount]
  );
  const amountYocto = parseProtocolStakeAmountYocto(normalizedAmount);
  const amountOk = amountYocto > 0n;
  const amountError = protocolStakeAmountError(amountYocto, maxYocto, mode);
  const actionBlocked = protocolStakeActionBlocked(
    mode,
    Boolean(eligibility?.isInCooldown)
  );
  const showsAmountField = protocolStakeShowsAmountField(
    mode,
    Boolean(eligibility?.isInCooldown)
  );
  const remainingToThreshold = BigInt(eligibility?.remainingToThreshold ?? '0');
  const thresholdPreset =
    mode === 'delegate' &&
    !eligibility?.isInCooldown &&
    remainingToThreshold > 0n &&
    eligibility
      ? finalizeProtocolStakeAmountInput(
          yoctoToSocial(eligibility.remainingToThreshold)
        )
      : null;
  const amountPresets = thresholdPreset ? [thresholdPreset] : undefined;

  const applyMaxAmount = useCallback(() => {
    setFormError(null);
    setAmount(formatProtocolStakeMaxAmount(maxYocto));
  }, [maxYocto]);

  const stakeWhisper = protocolStakeWhisper(
    mode,
    Boolean(eligibility?.isInCooldown)
  );
  const [cooldownTick, setCooldownTick] = useState(0);

  useEffect(() => {
    if (!open || !eligibility?.isInCooldown) return;
    const id = window.setInterval(() => {
      setCooldownTick((tick) => tick + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [eligibility?.isInCooldown, open]);

  const amountMeta = useMemo(
    () =>
      protocolStakeAmountMeta({
        mode,
        maxYocto,
        isInCooldown: Boolean(eligibility?.isInCooldown),
        nextActionTimestamp: eligibility?.nextActionTimestamp,
        cooldownRemainingNs: eligibility?.cooldownRemainingNs,
        nowMs: Date.now(),
      }),
    [
      cooldownTick,
      eligibility?.cooldownRemainingNs,
      eligibility?.isInCooldown,
      eligibility?.nextActionTimestamp,
      maxYocto,
      mode,
    ]
  );

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
        !amountError &&
        !actionBlocked &&
        loadState === 'ready',
      pending,
      disabled:
        pending ||
        !accountId ||
        !stakingReady ||
        !amountOk ||
        Boolean(amountError) ||
        actionBlocked ||
        loadState !== 'ready',
      primaryType: 'submit',
    };
  }, [
    open,
    ctaLabel,
    pending,
    accountId,
    stakingReady,
    amountOk,
    amountError,
    actionBlocked,
    loadState,
  ]);

  return (
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb="Stake"
      handle={daoAccountId ?? undefined}
      whisper={stakeWhisper}
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
          if (
            !eligibility?.stakingContractId ||
            !amountOk ||
            amountError ||
            actionBlocked ||
            pending
          )
            return;
          setFormError(null);
          try {
            const amountYoctoStr = amountYocto.toString();
            if (mode === 'delegate') onDelegate(amountYoctoStr);
            else if (mode === 'undelegate') onUndelegate([amountYoctoStr]);
            else onWithdraw(amountYoctoStr);
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
            <ProtocolStakeFacts eligibility={eligibility} />

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
                  onMouseDown={(event) => {
                    // Keep amount field from blurring with stale mode limits.
                    event.preventDefault();
                  }}
                  onClick={() => selectMode(value)}
                  disabled={pending}
                >
                  {label}
                </button>
              ))}
            </div>

            {showsAmountField ? (
              <>
                <AmountField
                  value={amount}
                  onValueChange={applyAmountInput}
                  maxDecimals={SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS}
                  placeholder="0"
                  aria-label="Amount in SOCIAL"
                  invalid={Boolean(amountError)}
                  unit="SOCIAL"
                  unitIcon={<TokenIcon src={socialIcon} label="SOCIAL" />}
                  disabled={pending}
                />

                <AmountFieldMetaRow
                  tone="support"
                  presets={amountPresets}
                  selectedValue={normalizedAmount}
                  onSelectPreset={applyAmountInput}
                  max={{
                    onClick: applyMaxAmount,
                    disabled: maxYocto <= 0n,
                  }}
                  disabled={pending}
                  meta={amountMeta}
                />
              </>
            ) : amountMeta ? (
              <p className="protocol-stake-status">{amountMeta}</p>
            ) : null}

            {amountError ? (
              <p className="protocol-compose-note is-warn" role="alert">
                {amountError}
              </p>
            ) : null}
          </>
        ) : null}

        {formError ? (
          <p className="protocol-compose-note is-warn">{formError}</p>
        ) : null}
      </form>
    </ProtocolTaskSheet>
  );
}
