'use client';

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import {
  AmountFieldMetaRow,
  ChartFillIcon,
  Divider,
  GlassSheet,
  OsIconAction,
  SheetCloseButton,
  TokenIcon,
  osIconActionGlyphClassName,
  useScrollLock,
} from '@onsocial/ui';
import {
  buildBoostLockMsg,
  encodeBoostFtMsg,
  type BoostLockPeriod,
} from '@onsocial/sdk/advanced';
import { AmountField } from '@onsocial/ui';
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
  isLongerLockPeriod,
  longerLockPeriodOptions,
  resolveCurrentLockMonths,
  BOOST_MIN_LOCK_SOCIAL_LABEL,
  BOOST_MIN_LOCK_YOCTO,
  BOOST_UNLOCK_GAS,
  fetchWalletSocialBalanceYocto,
  formatTimeRemainingLabel,
  formatUnlockDateLabel,
  formatYoctoSocialFixed,
  formatYoctoSocialParts,
  lockPeriodOption,
  previewUnlockDateLabel,
} from '@/features/boost/boost-position';
import type { BoostPosition } from '@/features/boost/use-boost-position';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import {
  ACTIVE_NEAR_NETWORK,
  BOOST_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
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
const BOOST_MODE_SWAP_MS = 180;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type BoostModeSlotHandle = {
  /** Lock current slot height before setMode — prevents hug-sheet top snap. */
  prepareSwap: () => void;
};

/**
 * Mode body only — outgoing fades up, incoming fades in, shell height tweens.
 * Call `prepareSwap()` before changing `mode` so the hug drawer top doesn’t jump.
 */
function BoostModeSlot({
  mode,
  children,
  ref,
}: {
  mode: BoostSheetMode;
  children: ReactNode;
  ref?: Ref<BoostModeSlotHandle>;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef(mode);
  const prevChildrenRef = useRef(children);
  const [exit, setExit] = useState<{
    mode: BoostSheetMode;
    node: ReactNode;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    prepareSwap: () => {
      const shell = shellRef.current;
      if (!shell || prefersReducedMotion()) return;
      shell.style.height = `${shell.offsetHeight}px`;
    },
  }));

  useLayoutEffect(() => {
    if (mode === prevModeRef.current) return;

    const fromMode = prevModeRef.current;
    const fromNode = prevChildrenRef.current;
    prevModeRef.current = mode;
    prevChildrenRef.current = children;

    if (prefersReducedMotion()) {
      setExit(null);
      const shell = shellRef.current;
      if (shell) shell.style.height = 'auto';
      return;
    }

    setExit({ mode: fromMode, node: fromNode });

    const shell = shellRef.current;
    const applyHeight = () => {
      if (!shell) return;
      const inEl = shell.querySelector(
        '[data-boost-mode-layer="in"]'
      ) as HTMLElement | null;
      if (!inEl) return;
      const to = inEl.offsetHeight;
      // Height should already be locked via prepareSwap; tween to the new body.
      void shell.offsetHeight;
      shell.style.height = `${to}px`;
    };
    requestAnimationFrame(() => requestAnimationFrame(applyHeight));

    const timer = window.setTimeout(() => {
      setExit(null);
      if (shell) shell.style.height = 'auto';
    }, BOOST_MODE_SWAP_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode-driven swap
  }, [mode]);

  useLayoutEffect(() => {
    if (!exit) prevChildrenRef.current = children;
  }, [children, exit]);

  const swapping = exit != null;

  return (
    <div ref={shellRef} className="portfolio-boost-mode-slot">
      {exit ? (
        <div
          key={`out-${exit.mode}`}
          data-boost-mode-layer="out"
          className="portfolio-boost-mode-layer is-out"
          aria-hidden
        >
          {exit.node}
        </div>
      ) : null}
      <div
        key={`in-${mode}`}
        data-boost-mode-layer="in"
        className={
          swapping
            ? 'portfolio-boost-mode-layer is-in'
            : 'portfolio-boost-mode-layer'
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Standing-style shimmer shell. Neutral bars only — no real copy, since we
 * don't yet know whether this resolves to the manage view or the lock form.
 */
function BoostSheetLoadingSkeleton() {
  return (
    <div
      className="portfolio-boost-view"
      role="status"
      aria-label="Loading boost"
    >
      <section className="portfolio-boost-collect" aria-hidden>
        <span className="standing-row-shimmer portfolio-boost-shimmer-eyebrow" />
        <span className="standing-row-shimmer portfolio-boost-shimmer-amount" />
        <span className="standing-row-shimmer portfolio-boost-shimmer-rate" />
      </section>
      <div className="portfolio-boost-mode-row" aria-hidden>
        <span className="standing-row-shimmer portfolio-boost-shimmer-chip" />
        <span className="standing-row-shimmer portfolio-boost-shimmer-chip" />
        <span className="standing-row-shimmer portfolio-boost-shimmer-chip" />
      </div>
      <section className="portfolio-boost-summary" aria-hidden>
        {[0, 1, 2].map((row) => (
          <div key={row} className="portfolio-boost-summary-row">
            <span className="standing-row-shimmer portfolio-boost-shimmer-label" />
            <span className="standing-row-shimmer portfolio-boost-shimmer-value" />
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * Live counter — portal `LiveClaimableAmount` pattern: mono digits, each
 * fraction digit in a fixed 1ch slot so ticks never reflow.
 */
function BoostLiveClaimableAmount({ valueYocto }: { valueYocto: bigint }) {
  const { whole, fraction, full } = formatYoctoSocialParts(
    valueYocto,
    LIVE_COUNTER_FRACTION_DIGITS
  );

  return (
    <p
      className="portfolio-boost-collect-amount"
      aria-label={`${full} SOCIAL ready to collect`}
    >
      <span className="portfolio-boost-collect-amount-inner" aria-hidden>
        <span className="portfolio-boost-collect-whole">{whole}</span>
        <span className="portfolio-boost-collect-point">.</span>
        <span
          className="portfolio-boost-collect-fraction"
          style={{ minWidth: `${LIVE_COUNTER_FRACTION_DIGITS}ch` }}
        >
          {fraction.split('').map((digit, index) => (
            <span
              key={`fraction-${index}`}
              className="portfolio-boost-collect-digit"
            >
              {digit}
            </span>
          ))}
        </span>
      </span>
    </p>
  );
}

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
      <AmountField
        value={amountInput}
        onValueChange={onAmountInput}
        maxDecimals={SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS}
        placeholder={BOOST_MIN_LOCK_SOCIAL_LABEL}
        aria-label="Amount in SOCIAL"
        unit="SOCIAL"
        unitIcon={<TokenIcon src={tokenIconSrc} label="SOCIAL" />}
        disabled={disabled}
      />
      <AmountFieldMetaRow
        tone="support"
        max={{
          onClick: onMax,
          disabled: balanceYocto == null || balanceYocto === 0n,
        }}
        disabled={disabled}
        meta={
          balanceYocto != null
            ? `${formatSocialCompact(balanceYocto)} available`
            : null
        }
      />
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
  const { panelStyle: keyboardPanelStyle, keyboardOpen } =
    useCommerceSheetKeyboard(sheetOpen);
  const panelStyle = useMemo((): CSSProperties | undefined => {
    const moodStyle = mood
      ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
      : undefined;
    if (!moodStyle && !keyboardPanelStyle) return undefined;
    return { ...moodStyle, ...keyboardPanelStyle };
  }, [keyboardPanelStyle, mood]);

  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const socialIcon = useSocialTokenIcon();

  const [mode, setMode] = useState<BoostSheetMode>('collect');
  const modeSlotRef = useRef<BoostModeSlotHandle>(null);
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
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

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
    lockStatus,
    loaded,
    hasPosition,
    lockedYocto,
    claimableYocto,
    ratePerSecondYocto,
    canUnlock,
    refresh,
    resetLiveCounterAfterClaim,
  } = position;

  const currentLockMonths = resolveCurrentLockMonths(account, lockStatus);
  const currentOption = lockPeriodOption(currentLockMonths);
  const canIncrease = hasPosition && currentOption != null;
  const extendOptions = hasPosition
    ? longerLockPeriodOptions(currentLockMonths)
    : [];
  const extendOption =
    extendMonths != null ? lockPeriodOption(extendMonths) : null;
  const extendInfluenceYocto =
    extendOption != null
      ? applyLockBonus(lockedYocto, extendOption.bonusPercent)
      : null;
  const summaryBonusOption =
    mode === 'extend' && extendOption ? extendOption : currentOption;

  // Drop a stale Extend selection if the position caught up to that period.
  if (
    extendMonths != null &&
    currentLockMonths > 0 &&
    !isLongerLockPeriod(extendMonths, currentLockMonths)
  ) {
    setExtendMonths(null);
  }
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
  const increaseInfluenceYocto =
    mode === 'increase' && amountReady && currentOption
      ? applyLockBonus(lockedYocto + amountYocto, currentOption.bonusPercent)
      : null;
  const summaryInfluenceYocto =
    mode === 'extend' && extendInfluenceYocto != null
      ? extendInfluenceYocto
      : increaseInfluenceYocto;
  const summaryUnlockPreviewMonths =
    mode === 'extend' && extendOption
      ? extendOption.months
      : mode === 'renew' && currentOption
        ? currentOption.months
        : mode === 'increase' && amountReady && currentOption
          ? currentOption.months
          : null;

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
        resetLiveCounterAfterClaim();
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
        resetLiveCounterAfterClaim();
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
    if (!isLongerLockPeriod(option.months, currentLockMonths)) {
      setFieldError('Pick a longer period than your current commitment.');
      return;
    }
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
    if (pendingAction || next === mode) return;
    modeSlotRef.current?.prepareSwap();
    setFieldError(null);
    setAmountInput('');
    setExtendMonths(null);
    setMode(next);
  }

  const txPending = pendingAction != null;

  const modeChips: { id: BoostSheetMode; label: string }[] = [
    { id: 'collect', label: 'Collect' },
    ...(canIncrease ? [{ id: 'increase' as const, label: 'Increase' }] : []),
    { id: 'renew', label: 'Renew' },
    ...(extendOptions.length > 0
      ? [{ id: 'extend' as const, label: 'Extend' }]
      : []),
  ];

  /**
   * Completed lock — unlock is the default; renew keeps the same period;
   * extend (when available) upgrades without an unlock gap.
   */
  const completeChips: typeof modeChips = [
    { id: 'collect', label: 'Unlock' },
    { id: 'renew', label: 'Renew' },
    ...(extendOptions.length > 0
      ? [{ id: 'extend' as const, label: 'Extend' }]
      : []),
  ];

  const footerState = ((): CommerceSheetFooterState | null => {
    if (!loaded) return null;

    if (!hasPosition) {
      return {
        visible: true,
        primaryLabel: 'Commit',
        primaryPendingLabel: 'Committing…',
        canSubmit: amountReady && !txPending,
        pending: pendingAction === 'commit',
        disabled: txPending || !amountReady,
        primaryType: 'button',
        onPrimaryClick: handleCommit,
      };
    }

    if (mode === 'renew') {
      return {
        visible: true,
        primaryLabel: 'Renew',
        primaryPendingLabel: 'Renewing…',
        canSubmit: !txPending,
        pending: pendingAction === 'renew',
        disabled: txPending,
        primaryType: 'button',
        onPrimaryClick: handleRenew,
      };
    }

    if (mode === 'extend') {
      const canExtend =
        extendMonths != null &&
        isLongerLockPeriod(extendMonths, currentLockMonths);
      const extendLabel = canExtend
        ? `Extend to ${lockPeriodOption(extendMonths)?.short}`
        : 'Pick a period';
      return {
        visible: true,
        primaryLabel: extendLabel,
        primaryPendingLabel: 'Extending…',
        canSubmit: canExtend && !txPending,
        pending: pendingAction === 'extend',
        disabled: txPending || !canExtend,
        primaryType: 'button',
        onPrimaryClick: handleExtend,
      };
    }

    if (canUnlock) {
      return {
        visible: true,
        primaryLabel: 'Unlock + collect',
        primaryPendingLabel: 'Releasing…',
        canSubmit: !txPending,
        pending: pendingAction === 'unlock',
        disabled: txPending,
        primaryType: 'button',
        onPrimaryClick: handleUnlock,
      };
    }

    if (mode === 'increase') {
      return {
        visible: true,
        primaryLabel: 'Increase',
        primaryPendingLabel: 'Committing…',
        canSubmit: amountReady && !txPending,
        pending: pendingAction === 'commit',
        disabled: txPending || !amountReady,
        primaryType: 'button',
        onPrimaryClick: handleCommit,
      };
    }

    return {
      visible: true,
      primaryLabel: 'Collect',
      primaryPendingLabel: 'Collecting…',
      canSubmit: claimableYocto >= BOOST_CLAIM_DUST_YOCTO && !txPending,
      pending: pendingAction === 'collect',
      disabled: txPending || claimableYocto < BOOST_CLAIM_DUST_YOCTO,
      primaryType: 'button',
      onPrimaryClick: handleCollect,
    };
  })();

  return (
    <>
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      sizing="hug"
      moodId={mood?.id}
      panelStyle={panelStyle}
      panelClassName={`profile-support-sheet-panel${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
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
                  <h2
                    id={titleId}
                    className="portfolio-payout-sheet-total portfolio-boost-sheet-title"
                    aria-label={
                      !loaded
                        ? 'Loading boost'
                        : hasPosition
                          ? `${formatSocialCompact(lockedYocto)} SOCIAL locked`
                          : 'Lock SOCIAL'
                    }
                  >
                    {!loaded ? (
                      <span
                        className="standing-row-shimmer portfolio-boost-shimmer-title"
                        aria-hidden
                      />
                    ) : hasPosition ? (
                      <>
                        <span
                          className="portfolio-boost-sheet-title-amount"
                          aria-hidden
                        >
                          {formatSocialCompact(lockedYocto)}
                        </span>
                        <span
                          className="portfolio-payout-sheet-unit"
                          aria-hidden
                        >
                          SOCIAL locked
                        </span>
                      </>
                    ) : (
                      <span aria-hidden>Lock SOCIAL</span>
                    )}
                  </h2>
                </div>
              </div>
              <div className="standing-sheet-actions standing-sheet-actions--payout">
                <OsIconAction
                  ariaLabel="Open boost leaderboard"
                  onClick={() => setLeaderboardOpen(true)}
                >
                  <ChartFillIcon
                    className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                    aria-hidden
                  />
                </OsIconAction>
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
      footer={
        footerState ? (
          <CommerceSheetFooter
            formId="portfolio-boost-sheet"
            keyboardOpen={keyboardOpen}
            state={footerState}
          />
        ) : undefined
      }
    >
      {!loaded ? (
        <BoostSheetLoadingSkeleton />
      ) : hasPosition && account ? (
        <div className="portfolio-boost-view">
          <section className="portfolio-boost-collect" aria-live="off">
            <p className="portfolio-payout-sheet-eyebrow">Ready to collect</p>
            <BoostLiveClaimableAmount valueYocto={claimableYocto} />
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

          <div
            className="portfolio-boost-mode-row"
            role="group"
            aria-label="Boost actions"
          >
            {(canUnlock ? completeChips : modeChips).map((chip) => (
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

          <BoostModeSlot ref={modeSlotRef} mode={mode}>
            {canUnlock && mode === 'collect' ? (
              <p className="portfolio-boost-note portfolio-boost-note--center">
                Release your lock and collect everything.
              </p>
            ) : null}

            {!canUnlock && mode === 'increase' ? (
              <BoostAmountField
                amountInput={amountInput}
                onAmountInput={applyAmountInput}
                onMax={applyMaxAmount}
                balanceYocto={balanceYocto}
                tokenIconSrc={socialIcon}
                disabled={txPending}
              />
            ) : null}

            {mode === 'extend' ? (
              extendOptions.length > 0 || currentOption ? (
                <div
                  className="portfolio-boost-periods"
                  role="group"
                  aria-label="Extend lock period"
                  style={
                    {
                      '--boost-period-cols': String(
                        Math.max(
                          (currentOption ? 1 : 0) + extendOptions.length,
                          1
                        )
                      ),
                    } as CSSProperties
                  }
                >
                  {currentOption ? (
                    <button
                      type="button"
                      className={`os-surface-chip${
                        extendMonths == null ? ' is-selected' : ''
                      }`}
                      disabled
                      aria-current={extendMonths == null ? 'true' : undefined}
                    >
                      {currentOption.short}
                      <span className="portfolio-boost-period-bonus">
                        +{currentOption.bonusPercent}%
                      </span>
                    </button>
                  ) : null}
                  {extendOptions.map((option) => (
                    <button
                      key={option.months}
                      type="button"
                      className={`os-surface-chip${
                        extendMonths === option.months ? ' is-selected' : ''
                      }`}
                      disabled={txPending}
                      onClick={() =>
                        setExtendMonths((current) =>
                          current === option.months ? null : option.months
                        )
                      }
                    >
                      {option.short}
                      <span className="portfolio-boost-period-bonus">
                        +{option.bonusPercent}%
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="portfolio-boost-note">
                  You’re already on the longest commitment.
                </p>
              )
            ) : null}

            {fieldError || amountError ? (
              <p className="profile-support-error" role="alert">
                {fieldError ?? amountError}
              </p>
            ) : null}
          </BoostModeSlot>

          <section className="portfolio-boost-summary" aria-label="Commitment">
            <div className="portfolio-boost-summary-row">
              <span className="portfolio-boost-summary-label">Influence</span>
              <span className="portfolio-boost-summary-value">
                {formatSocialCompact(
                  summaryInfluenceYocto ?? account.effective_boost
                )}
              </span>
            </div>
            {summaryBonusOption ? (
              <div className="portfolio-boost-summary-row">
                <span className="portfolio-boost-summary-label">Bonus</span>
                <span className="portfolio-boost-summary-value">
                  +{summaryBonusOption.bonusPercent}%
                </span>
              </div>
            ) : null}
            <div className="portfolio-boost-summary-row">
              <span className="portfolio-boost-summary-label">Unlocks</span>
              <span className="portfolio-boost-summary-value">
                {summaryUnlockPreviewMonths != null ? (
                  previewUnlockDateLabel(summaryUnlockPreviewMonths)
                ) : (
                  <>
                    {formatUnlockDateLabel(account.unlock_at)} ·{' '}
                    {formatTimeRemainingLabel(account.unlock_at)}
                  </>
                )}
              </span>
            </div>
            <div className="portfolio-boost-summary-row">
              <span className="portfolio-boost-summary-label">Collected</span>
              <span className="portfolio-boost-summary-value">
                {formatSocialCompact(account.rewards_claimed)}
              </span>
            </div>
          </section>
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
            style={
              {
                '--boost-period-cols': String(BOOST_LOCK_PERIOD_OPTIONS.length),
              } as CSSProperties
            }
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
              Longer commitments earn a bigger influence bonus.
            </p>
          )}

          {fieldError || amountError ? (
            <p className="profile-support-error" role="alert">
              {fieldError ?? amountError}
            </p>
          ) : null}
        </div>
      )}
    </GlassSheet>
    <LeaderboardSheet
      open={leaderboardOpen}
      onClose={() => setLeaderboardOpen(false)}
      initialTrack="influence"
    />
    </>
  );
}
