'use client';

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from 'react';
import {
  Divider,
  GlassSheet,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  buildBoostLockMsg,
  encodeBoostFtMsg,
  type BoostLockPeriod,
} from '@onsocial/sdk/advanced';
import { TokenIcon } from '@/components/ui/token-icon';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import {
  applyLockBonus,
  BOOST_ADJUST_GAS,
  BOOST_CLAIM_DUST_YOCTO,
  BOOST_CLAIM_GAS,
  BOOST_DEFAULT_LOCK_MONTHS,
  BOOST_LOCK_GAS,
  BOOST_LOCK_PERIOD_OPTIONS,
  BOOST_MIN_LOCK_SOCIAL_LABEL,
  BOOST_MIN_LOCK_YOCTO,
  BOOST_UNLOCK_GAS,
  fetchWalletSocialBalanceYocto,
  formatTimeRemainingLabel,
  formatUnlockDateLabel,
  formatYoctoSocialFixed,
  lockPeriodOption,
  previewUnlockDateLabel,
} from '@/features/boost/boost-position';
import type { BoostPosition } from '@/features/boost/use-boost-position';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import {
  ACTIVE_NEAR_NETWORK,
  BOOST_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { portalHref } from '@/lib/app-links';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import {
  formatSocialCompact,
  yoctoToSocial,
} from '@/lib/format-social-balance';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import {
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  socialToYocto,
} from '@/lib/social-spend-profile';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type BoostSheetMode = 'collect' | 'increase' | 'renew' | 'extend';
type BoostTxAction = 'commit' | 'collect' | 'unlock' | 'renew' | 'extend';

const LIVE_COUNTER_FRACTION_DIGITS = 4;

interface PortfolioBoostSheetProps {
  open: boolean;
  accountId: string;
  position: BoostPosition;
  onOpenChange: (open: boolean) => void;
}

function BoostAmountField({
  amountInput,
  onAmountInput,
  onMax,
  balanceYocto,
  tokenIconSrc,
  disabled,
}: {
  amountInput: string;
  onAmountInput: (raw: string) => void;
  onMax: () => void;
  balanceYocto: bigint | null;
  tokenIconSrc: string | null;
  disabled: boolean;
}) {
  return (
    <>
      <div className="app-storage-amount-field profile-support-amount-field">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amountInput}
          onChange={(event) => onAmountInput(event.target.value)}
          onBlur={() =>
            onAmountInput(
              finalizeAmountInput(
                amountInput,
                SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
              )
            )
          }
          placeholder={BOOST_MIN_LOCK_SOCIAL_LABEL}
          aria-label="Amount in SOCIAL"
          className="app-storage-amount-input"
          disabled={disabled}
        />
        <span className="account-card-balance-unit profile-support-token-unit">
          <TokenIcon src={tokenIconSrc} label="SOCIAL" />
          SOCIAL
        </span>
      </div>
      <div className="profile-support-quick-row">
        <div
          className="app-storage-presets profile-support-presets"
          role="group"
          aria-label="Quick amounts"
        >
          <button
            type="button"
            className="os-surface-chip"
            disabled={disabled || balanceYocto == null || balanceYocto === 0n}
            onClick={onMax}
          >
            Max
          </button>
        </div>
        {balanceYocto != null ? (
          <p className="profile-support-balance">
            {formatSocialCompact(balanceYocto)} available
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * Owner boost drawer — commit SOCIAL into a lock, or manage an existing
 * position (collect / increase / renew / extend / unlock). Money-sheet
 * family, same chrome as profile Support and post Amplify.
 */
export function PortfolioBoostSheet({
  open,
  accountId,
  position,
  onOpenChange,
}: PortfolioBoostSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
    : undefined;

  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const socialIcon = useSocialTokenIcon();

  const [mode, setMode] = useState<BoostSheetMode>('collect');
  const [pendingAction, setPendingAction] = useState<BoostTxAction | null>(
    null
  );
  const [amountInput, setAmountInput] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<BoostLockPeriod>(
    BOOST_DEFAULT_LOCK_MONTHS
  );
  const [extendMonths, setExtendMonths] = useState<BoostLockPeriod | null>(
    null
  );
  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode('collect');
      setAmountInput('');
      setExtendMonths(null);
      setFieldError(null);
    }
  }

  useScrollLock(open || closing);

  const refreshWalletBalance = useCallback(async () => {
    try {
      setBalanceYocto(await fetchWalletSocialBalanceYocto(accountId));
    } catch {
      setBalanceYocto(null);
    }
  }, [accountId]);

  useEffect(() => {
    if (!open) return;
    void refreshWalletBalance();
  }, [open, refreshWalletBalance]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const {
    account,
    loaded,
    hasPosition,
    lockedYocto,
    claimableYocto,
    ratePerSecondYocto,
    canUnlock,
    refresh,
  } = position;

  const currentOption = account ? lockPeriodOption(account.lock_months) : null;
  const canIncrease = hasPosition && currentOption != null;
  const extendOptions = hasPosition
    ? BOOST_LOCK_PERIOD_OPTIONS.filter(
        (option) => account != null && option.months > account.lock_months
      )
    : [];
  const commitOption =
    lockPeriodOption(selectedMonths) ??
    lockPeriodOption(BOOST_DEFAULT_LOCK_MONTHS)!;

  const normalizedAmount = finalizeAmountInput(
    amountInput,
    SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
  );
  const amountYocto = normalizedAmount
    ? BigInt(socialToYocto(normalizedAmount))
    : 0n;
  const belowMinimum = amountYocto > 0n && amountYocto < BOOST_MIN_LOCK_YOCTO;
  const insufficient =
    amountYocto > 0n && balanceYocto != null && amountYocto > balanceYocto;
  const amountError = belowMinimum
    ? `Minimum is ${BOOST_MIN_LOCK_SOCIAL_LABEL} SOCIAL.`
    : insufficient
      ? 'Not enough SOCIAL in your wallet.'
      : null;
  const amountReady = amountYocto >= BOOST_MIN_LOCK_YOCTO && !insufficient;

  const applyAmountInput = useCallback((raw: string) => {
    setAmountInput(
      normalizeAmountInput(raw, SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS)
    );
  }, []);

  const applyMaxAmount = useCallback(() => {
    if (balanceYocto == null) return;
    setAmountInput(
      finalizeAmountInput(
        yoctoToSocial(balanceYocto),
        SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
      )
    );
  }, [balanceYocto]);

  async function runBoostTransaction(input: {
    action: BoostTxAction;
    receiverId: string;
    functionCall: {
      methodName: string;
      args: Record<string, unknown>;
      gas: string;
      deposit: string;
    };
    confirmingMessage: string;
    successMessage: string;
    failureMessage: string;
    onConfirmed?: () => void | Promise<void>;
  }) {
    if (pendingAction) return;
    setFieldError(null);
    setPendingAction(input.action);
    try {
      const { accountId: signingAccountId, wallet } = await getClient();
      const payment = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId: signingAccountId,
        receiverId: input.receiverId,
        actions: [
          { type: 'FunctionCall' as const, params: input.functionCall },
        ],
      });
      const txHashes = extractNearTransactionHashes(payment);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: input.confirmingMessage,
        successMessage: input.successMessage,
        failureMessage: input.failureMessage,
      });
      if (confirmed) {
        await input.onConfirmed?.();
        await refresh();
      }
    } catch (cause) {
      if (!isWalletUserCancellation(cause)) {
        setTxResult({
          type: 'error',
          msg: cause instanceof Error ? cause.message : input.failureMessage,
        });
      }
    } finally {
      setPendingAction(null);
    }
  }

  function handleCommit() {
    const months = hasPosition
      ? (currentOption?.months ?? null)
      : commitOption.months;
    if (months == null) return;
    if (amountYocto < BOOST_MIN_LOCK_YOCTO || insufficient) {
      setFieldError(
        amountError ?? `Minimum is ${BOOST_MIN_LOCK_SOCIAL_LABEL} SOCIAL.`
      );
      return;
    }
    void runBoostTransaction({
      action: 'commit',
      receiverId: SOCIAL_TOKEN_CONTRACT,
      functionCall: {
        methodName: 'ft_transfer_call',
        args: {
          receiver_id: BOOST_CONTRACT,
          amount: amountYocto.toString(),
          msg: encodeBoostFtMsg(buildBoostLockMsg(months)),
        },
        gas: BOOST_LOCK_GAS,
        deposit: '1',
      },
      confirmingMessage: txToastConfirming.committingBoost,
      successMessage: txToastSuccess.boostCommitted(normalizedAmount),
      failureMessage: txToastError.commitBoostFailed,
      onConfirmed: async () => {
        setAmountInput('');
        setMode('collect');
        await Promise.all([
          refreshAppSocialBalanceAfterClaim(),
          refreshWalletBalance(),
        ]);
      },
    });
  }

  function handleCollect() {
    if (claimableYocto < BOOST_CLAIM_DUST_YOCTO) return;
    void runBoostTransaction({
      action: 'collect',
      receiverId: BOOST_CONTRACT,
      functionCall: {
        methodName: 'claim_rewards',
        args: {},
        gas: BOOST_CLAIM_GAS,
        deposit: '0',
      },
      confirmingMessage: txToastConfirming.collectingBoost,
      successMessage: txToastSuccess.boostCollected,
      failureMessage: txToastError.collectBoostFailed,
      onConfirmed: async () => {
        await Promise.all([
          refreshAppSocialBalanceAfterClaim(),
          refreshWalletBalance(),
        ]);
      },
    });
  }

  function handleUnlock() {
    void runBoostTransaction({
      action: 'unlock',
      receiverId: BOOST_CONTRACT,
      functionCall: {
        methodName: 'unlock',
        args: {},
        gas: BOOST_UNLOCK_GAS,
        deposit: '0',
      },
      confirmingMessage: txToastConfirming.releasingBoost,
      successMessage: txToastSuccess.boostReleased,
      failureMessage: txToastError.releaseBoostFailed,
      onConfirmed: async () => {
        await Promise.all([
          refreshAppSocialBalanceAfterClaim(),
          refreshWalletBalance(),
        ]);
      },
    });
  }

  function handleRenew() {
    void runBoostTransaction({
      action: 'renew',
      receiverId: BOOST_CONTRACT,
      functionCall: {
        methodName: 'renew_lock',
        args: {},
        gas: BOOST_ADJUST_GAS,
        deposit: '0',
      },
      confirmingMessage: txToastConfirming.renewingBoost,
      successMessage: txToastSuccess.boostRenewed,
      failureMessage: txToastError.renewBoostFailed,
      onConfirmed: () => {
        setMode('collect');
      },
    });
  }

  function handleExtend() {
    const option = extendMonths ? lockPeriodOption(extendMonths) : null;
    if (!option) return;
    void runBoostTransaction({
      action: 'extend',
      receiverId: BOOST_CONTRACT,
      functionCall: {
        methodName: 'extend_lock',
        args: { months: option.months },
        gas: BOOST_ADJUST_GAS,
        deposit: '0',
      },
      confirmingMessage: txToastConfirming.extendingBoost,
      successMessage: txToastSuccess.boostExtended(option.label),
      failureMessage: txToastError.extendBoostFailed,
      onConfirmed: () => {
        setMode('collect');
        setExtendMonths(null);
      },
    });
  }

  function switchMode(next: BoostSheetMode) {
    if (pendingAction) return;
    setFieldError(null);
    setAmountInput('');
    setExtendMonths(null);
    setMode(next);
  }

  const txPending = pendingAction != null;

  const portalLink = (
    <p className="portfolio-boost-portal-link">
      <a href={portalHref('/boost')} target="_blank" rel="noreferrer">
        Leaderboard &amp; details on Portal
      </a>
    </p>
  );

  const modeChips: { id: BoostSheetMode; label: string }[] = [
    { id: 'collect', label: 'Collect' },
    ...(canIncrease ? [{ id: 'increase' as const, label: 'Increase' }] : []),
    { id: 'renew', label: 'Renew' },
    ...(extendOptions.length > 0
      ? [{ id: 'extend' as const, label: 'Extend' }]
      : []),
  ];

  const primaryAction = canUnlock ? (
    <OsSheetAction
      type="button"
      ready={!txPending}
      pending={pendingAction === 'unlock'}
      pendingLabel="Releasing…"
      disabled={txPending}
      onClick={handleUnlock}
    >
      Unlock + collect
    </OsSheetAction>
  ) : mode === 'increase' ? (
    <OsSheetAction
      type="button"
      ready={amountReady && !txPending}
      pending={pendingAction === 'commit'}
      pendingLabel="Committing…"
      disabled={txPending || !amountReady}
      onClick={handleCommit}
    >
      Increase
    </OsSheetAction>
  ) : mode === 'renew' ? (
    <OsSheetAction
      type="button"
      ready={!txPending}
      pending={pendingAction === 'renew'}
      pendingLabel="Renewing…"
      disabled={txPending}
      onClick={handleRenew}
    >
      Renew
    </OsSheetAction>
  ) : mode === 'extend' ? (
    <OsSheetAction
      type="button"
      ready={extendMonths != null && !txPending}
      pending={pendingAction === 'extend'}
      pendingLabel="Extending…"
      disabled={txPending || extendMonths == null}
      onClick={handleExtend}
    >
      {extendMonths != null
        ? `Extend to ${lockPeriodOption(extendMonths)?.short}`
        : 'Pick a period'}
    </OsSheetAction>
  ) : (
    <OsSheetAction
      type="button"
      ready={claimableYocto >= BOOST_CLAIM_DUST_YOCTO && !txPending}
      pending={pendingAction === 'collect'}
      pendingLabel="Collecting…"
      disabled={txPending || claimableYocto < BOOST_CLAIM_DUST_YOCTO}
      onClick={handleCollect}
    >
      Collect
    </OsSheetAction>
  );

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      moodId={mood?.id}
      panelStyle={panelStyle}
      panelClassName="profile-support-sheet-panel"
      initialDetent="full"
      peekRatio={1}
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close boost"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <div className="standing-sheet-header portfolio-support-collect-info-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <p className="portfolio-payout-sheet-eyebrow">Boost</p>
                  <h2 id={titleId} className="portfolio-payout-sheet-total">
                    {hasPosition ? (
                      <>
                        {formatSocialCompact(lockedYocto)}{' '}
                        <span className="portfolio-payout-sheet-unit">
                          SOCIAL locked
                        </span>
                      </>
                    ) : (
                      'Lock SOCIAL'
                    )}
                  </h2>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close boost"
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {!loaded ? (
        <div className="portfolio-boost-view">
          <p className="portfolio-boost-note">Loading your boost…</p>
        </div>
      ) : hasPosition && account ? (
        <div className="portfolio-boost-view">
          <section className="portfolio-boost-collect" aria-live="off">
            <p className="portfolio-payout-sheet-eyebrow">Ready to collect</p>
            <p className="portfolio-boost-collect-amount">
              {formatYoctoSocialFixed(
                claimableYocto,
                LIVE_COUNTER_FRACTION_DIGITS
              )}{' '}
              <span className="portfolio-boost-collect-unit">SOCIAL</span>
            </p>
            {ratePerSecondYocto > 0n ? (
              <p className="portfolio-boost-collect-rate">
                +
                {formatYoctoSocialFixed(
                  ratePerSecondYocto,
                  LIVE_COUNTER_FRACTION_DIGITS
                )}
                /sec
              </p>
            ) : null}
          </section>

          {!canUnlock ? (
            <div
              className="portfolio-boost-mode-row"
              role="group"
              aria-label="Boost actions"
            >
              {modeChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`os-surface-chip${
                    mode === chip.id ? ' is-selected' : ''
                  }`}
                  disabled={txPending}
                  onClick={() => switchMode(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="portfolio-boost-note portfolio-boost-note--center">
              Your commitment is complete. Release your SOCIAL and collect
              everything in one go.
            </p>
          )}

          {!canUnlock && mode === 'increase' ? (
            <>
              <BoostAmountField
                amountInput={amountInput}
                onAmountInput={applyAmountInput}
                onMax={applyMaxAmount}
                balanceYocto={balanceYocto}
                tokenIconSrc={socialIcon}
                disabled={txPending}
              />
              <p className="portfolio-boost-note">
                Keeps {currentOption?.short} (+{currentOption?.bonusPercent}
                %). Timer resets from today.
                {amountReady && currentOption
                  ? ` New influence ${formatSocialCompact(
                      applyLockBonus(
                        lockedYocto + amountYocto,
                        currentOption.bonusPercent
                      )
                    )}.`
                  : ''}
              </p>
            </>
          ) : null}

          {!canUnlock && mode === 'renew' ? (
            <p className="portfolio-boost-note">
              Restart your{' '}
              {currentOption?.label ?? `${account.lock_months} month`}{' '}
              commitment from today. Locked amount stays the same.
            </p>
          ) : null}

          {!canUnlock && mode === 'extend' ? (
            <>
              <div
                className="portfolio-boost-periods"
                role="group"
                aria-label="Extend lock period"
              >
                {extendOptions.map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    className={`os-surface-chip${
                      extendMonths === option.months ? ' is-selected' : ''
                    }`}
                    disabled={txPending}
                    onClick={() => setExtendMonths(option.months)}
                  >
                    {option.short}
                    <span className="portfolio-boost-period-bonus">
                      +{option.bonusPercent}%
                    </span>
                  </button>
                ))}
              </div>
              <p className="portfolio-boost-note">
                Upgrade to a longer period. Timer resets from today.
              </p>
            </>
          ) : null}

          {fieldError || amountError ? (
            <p className="profile-support-error" role="alert">
              {fieldError ?? amountError}
            </p>
          ) : null}

          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            {primaryAction}
          </OsSheetActions>

          <section className="portfolio-boost-summary" aria-label="Commitment">
            <div className="portfolio-boost-summary-row">
              <span className="portfolio-boost-summary-label">Influence</span>
              <span className="portfolio-boost-summary-value">
                {formatSocialCompact(account.effective_boost)}
                {currentOption ? ` (+${currentOption.bonusPercent}%)` : ''}
              </span>
            </div>
            <div className="portfolio-boost-summary-row">
              <span className="portfolio-boost-summary-label">Unlocks</span>
              <span className="portfolio-boost-summary-value">
                {formatUnlockDateLabel(account.unlock_at)} ·{' '}
                {formatTimeRemainingLabel(account.unlock_at)}
              </span>
            </div>
            <div className="portfolio-boost-summary-row">
              <span className="portfolio-boost-summary-label">Collected</span>
              <span className="portfolio-boost-summary-value">
                {formatSocialCompact(account.rewards_claimed)} SOCIAL
              </span>
            </div>
          </section>

          {portalLink}
        </div>
      ) : (
        <div className="portfolio-boost-view">
          <p className="portfolio-boost-intro">
            Lock SOCIAL to grow your influence. Rewards accrue every second —
            collect anytime.
          </p>

          <div
            className="portfolio-boost-periods"
            role="group"
            aria-label="Lock period"
          >
            {BOOST_LOCK_PERIOD_OPTIONS.map((option) => (
              <button
                key={option.months}
                type="button"
                className={`os-surface-chip${
                  selectedMonths === option.months ? ' is-selected' : ''
                }`}
                disabled={txPending}
                onClick={() => setSelectedMonths(option.months)}
              >
                {option.short}
                <span className="portfolio-boost-period-bonus">
                  +{option.bonusPercent}%
                </span>
              </button>
            ))}
          </div>

          <BoostAmountField
            amountInput={amountInput}
            onAmountInput={applyAmountInput}
            onMax={applyMaxAmount}
            balanceYocto={balanceYocto}
            tokenIconSrc={socialIcon}
            disabled={txPending}
          />

          {amountReady ? (
            <p className="portfolio-boost-note">
              Influence{' '}
              {formatSocialCompact(
                applyLockBonus(amountYocto, commitOption.bonusPercent)
              )}{' '}
              · Unlocks {previewUnlockDateLabel(commitOption.months)}
            </p>
          ) : (
            <p className="portfolio-boost-note">
              One period. Locked until unlock — collect rewards anytime.
            </p>
          )}

          {fieldError || amountError ? (
            <p className="profile-support-error" role="alert">
              {fieldError ?? amountError}
            </p>
          ) : null}

          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={amountReady && !txPending}
              pending={pendingAction === 'commit'}
              pendingLabel="Committing…"
              disabled={txPending || !amountReady}
              onClick={handleCommit}
            >
              Commit
            </OsSheetAction>
          </OsSheetActions>

          {portalLink}
        </div>
      )}
    </GlassSheet>
  );
}
