'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AmountField, AmountFieldMetaRow, TokenIcon } from '@onsocial/ui';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import { ScarcePartyLine } from '@/features/scarces/scarce-party-line';
import {
  resolveDaoDirectoryCrest,
  resolveDaoDirectoryName,
} from '@/features/protocol/dao-directory';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import {
  applyProtocolStakeAmountInput,
  defaultProtocolStakeAmountInput,
  finalizeProtocolStakeAmountInput,
  parseProtocolStakeAmountYocto,
  protocolStakeActionBlocked,
  protocolStakeAmountError,
  protocolStakeAmountMeta,
  protocolStakeProgress,
  protocolStakeQuickFill,
  protocolStakeShowsAmountField,
  protocolStakeCtaLabel,
  protocolStakeModeVerb,
  protocolStakeWhisper,
  resolveProtocolStakeMaxYocto,
  type ProtocolStakeMode,
} from '@/features/protocol/protocol-stake-amount';
import { getStakingCooldownDurationNs } from '@/features/protocol/protocol-stake-cooldown';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
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
  const [cooldownDurationNs, setCooldownDurationNs] = useState<string | null>(
    null
  );

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
      setCooldownDurationNs(null);
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
    () => (eligibility ? resolveProtocolStakeMaxYocto(eligibility, mode) : 0n),
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
  const delegatedYocto = BigInt(eligibility?.delegatedWeight ?? '0');
  const requiredYocto = BigInt(eligibility?.requiredWeight ?? '0');
  const progress = protocolStakeProgress({
    mode,
    delegatedYocto,
    requiredYocto,
  });
  const quickFill = protocolStakeQuickFill({
    mode,
    remainingToThresholdYocto: remainingToThreshold,
  });

  const stakeWhisper = protocolStakeWhisper(
    mode,
    Boolean(eligibility?.isInCooldown),
    cooldownDurationNs
  );
  const [cooldownTick, setCooldownTick] = useState(0);

  useEffect(() => {
    const stakingId = eligibility?.stakingContractId;
    if (!open || !stakingId) {
      setCooldownDurationNs(null);
      return;
    }
    let cancelled = false;
    void getStakingCooldownDurationNs(stakingId).then((duration) => {
      if (!cancelled) setCooldownDurationNs(duration);
    });
    return () => {
      cancelled = true;
    };
  }, [eligibility?.stakingContractId, open]);

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
  const verb = protocolStakeModeVerb(mode);
  const boardName = daoAccountId ? resolveDaoDirectoryName(daoAccountId) : '';
  const boardLabel =
    daoAccountId &&
    boardName.trim().toLowerCase() !== daoAccountId.trim().toLowerCase()
      ? boardName
      : null;
  const boardCrest = daoAccountId
    ? resolveDaoDirectoryCrest(daoAccountId)
    : null;
  const ctaLabel = protocolStakeCtaLabel(
    mode,
    amountOk && !amountError ? normalizedAmount : null
  );

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
      verb={verb}
      whisper={stakeWhisper}
      closeAriaLabel={`Close ${verb.toLowerCase()}`}
      backdropLabel={`Close ${verb.toLowerCase()}`}
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
        {daoAccountId ? (
          <ScarcePartyLine
            accountId={daoAccountId}
            displayNameValue={boardLabel}
            avatarUrl={boardCrest}
          />
        ) : null}

        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to delegate.</p>
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
            <div
              className="protocol-mode-rail"
              role="tablist"
              aria-label="Delegate, undelegate, or withdraw"
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

            {progress ? (
              <p className="protocol-stake-status">
                {progress.ratio}
                {progress.canPropose ? (
                  <>
                    {' · '}
                    <span className="protocol-stake-status-met">
                      you can propose.
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}

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
                  presets={quickFill ? [quickFill] : undefined}
                  selectedValue={normalizedAmount}
                  onSelectPreset={applyAmountInput}
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
