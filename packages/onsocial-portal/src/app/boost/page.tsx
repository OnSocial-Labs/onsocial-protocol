'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import {
  motion,
  useInView,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion';
import {
  Lock,
  Gift,
  RefreshCw,
  ArrowUpRight,
  Unlock,
  Timer,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { PageShell } from '@/components/layout/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BoostStakeAmountSection } from '@/features/boost/boost-stake-amount-section';
import { BoostCommitmentPanelSkeleton } from '@/features/boost/boost-commitment-panel-skeleton';
import { BoostCommitmentSummary } from '@/features/boost/boost-commitment-summary';
import { BoostHowItWorks } from '@/features/boost/boost-how-it-works';
import {
  BOOST_COLLECT_ACTION_ROW_CLASS,
  BOOST_COLLECT_AMOUNT_ROW_CLASS,
  BOOST_COLLECT_RATE_ROW_CLASS,
  BOOST_COLLECT_SECTION_MIN_CLASS,
  BoostPageColumn,
  BOOST_PANEL_DIVIDER_CLASS,
  BOOST_PANEL_PADDING_CLASS,
} from '@/features/boost/boost-page-column';
import { BoostPageIntro } from '@/features/boost/boost-page-intro';
import { BoostNetworkPulse } from '@/features/boost/boost-network-pulse';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { CollectCelebration } from '@/components/ui/collect-celebration';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  BOOST_CONTRACT,
  extractNearTransactionHashes,
  yoctoToSocial,
  socialToYocto,
  TOKEN_CONTRACT,
} from '@/lib/near-rpc';
import { portalConnectButtonLabel } from '@/lib/portal-connect-copy';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { fetchActiveBoosterCount } from '@/lib/boost-network';
import { portalColors } from '@/lib/portal-colors';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import { txToastPending, txToastSuccess } from '@/lib/transaction-toast-copy';
import { cn } from '@/lib/utils';
import type {
  BoostAccountView,
  BoostContractStats as BoostStats,
  BoostLockStatus,
  BoostRewardsLiveSnapshot,
} from '@onsocial/sdk';

// ─── Lock Periods (matches VALID_LOCK_PERIODS in contract) ──
const LOCK_PERIODS = [
  {
    months: 1,
    bonus: 5,
    label: '1 Month',
    short: '1mo',
    color: portalColors.neutral,
  },
  {
    months: 6,
    bonus: 10,
    label: '6 Months',
    short: '6mo',
    color: portalColors.blue,
  },
  {
    months: 12,
    bonus: 20,
    label: '12 Months',
    short: '12mo',
    color: portalColors.green,
  },
  {
    months: 24,
    bonus: 35,
    label: '24 Months',
    short: '24mo',
    color: portalColors.purple,
  },
  {
    months: 48,
    bonus: 50,
    label: '48 Months',
    short: '48mo',
    color: portalColors.gold,
  },
];

const os = createPortalOnSocialClient();

const STAKE_AMOUNT_INPUT_DECIMALS = 6;
const STAKE_AMOUNT_MAX_DECIMALS = 18;
const MIN_STAKE_AMOUNT = '0.01';
const SOCIAL_DECIMALS = 18;
const YOCTO_PER_SOCIAL = 10n ** BigInt(SOCIAL_DECIMALS);
/** Exact yocto math; display uses fewer digits for a calmer live counter. */
const LIVE_COUNTER_FRACTION_DIGITS = 6;
const LIVE_COUNTER_DISPLAY_FRACTION_DIGITS = 4;
const REWARD_RATE_FRACTION_DIGITS = 4;
const LIVE_COUNTER_TICK_MS = 100;
/** Live counter re-sync; block-timestamp extrapolation keeps this interval reasonable. */
const BOOST_CHAIN_RESYNC_MS = 30_000;
/** Focus resync only after the tab was hidden at least this long (avoids extra re-anchors). */
const BOOST_FOCUS_RESYNC_MS = BOOST_CHAIN_RESYNC_MS;
const CLAIM_CELEBRATION_TIMEOUT_MS = 2100;
const REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS = 1400;
/** Hero collect panel hidden below this (0.0001 SOCIAL). */
const BOOST_CLAIM_DUST_YOCTO = 100_000_000_000_000_000n;
type BoostAction = 'stake' | 'claim' | 'unlock' | 'renew' | `extend:${number}`;
type ClaimCelebration = { id: number; amountYocto: bigint };

// ─── Helpers ─────────────────────────────────────────────────

function parseYocto(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function addThousandsSeparators(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatYoctoSocialFixed(
  value: bigint,
  fractionDigits = LIVE_COUNTER_FRACTION_DIGITS
): string {
  const digits = Math.max(0, Math.min(SOCIAL_DECIMALS, fractionDigits));
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / YOCTO_PER_SOCIAL;

  if (digits === 0) {
    return `${sign}${addThousandsSeparators(whole.toString())}`;
  }

  const fractionDivisor = 10n ** BigInt(SOCIAL_DECIMALS - digits);
  const fraction = ((absolute % YOCTO_PER_SOCIAL) / fractionDivisor)
    .toString()
    .padStart(digits, '0');

  return `${sign}${addThousandsSeparators(whole.toString())}.${fraction}`;
}

/** Split whole/fraction so the integer part stays visually steady while accruing. */
function formatYoctoSocialParts(
  value: bigint,
  fractionDigits = LIVE_COUNTER_DISPLAY_FRACTION_DIGITS
): { whole: string; fraction: string; full: string } {
  const full = formatYoctoSocialFixed(value, fractionDigits);
  if (fractionDigits === 0) {
    return { whole: full, fraction: '', full };
  }

  const dotIndex = full.indexOf('.');
  if (dotIndex === -1) {
    const fraction = '0'.repeat(fractionDigits);
    return {
      whole: full,
      fraction,
      full: `${full}.${fraction}`,
    };
  }

  return {
    whole: full.slice(0, dotIndex),
    fraction: full.slice(dotIndex + 1),
    full,
  };
}

/** Fixed-width slots so fraction digits tick without shifting layout. */
function LiveFractionDigit({ digit }: { digit: string }) {
  return (
    <span
      className="inline-block w-[1ch] shrink-0 text-center tabular-nums"
      aria-hidden
    >
      {digit}
    </span>
  );
}

function LiveClaimableAmount({
  valueYocto,
  fractionDigits,
  isLiveAccruing,
  stableFractionLayout = false,
  suffix,
  className,
}: {
  valueYocto: bigint;
  fractionDigits: number;
  isLiveAccruing: boolean;
  /** Keep fraction digit slots when idle — prevents height/structure jumps after collect. */
  stableFractionLayout?: boolean;
  suffix?: React.ReactNode;
  className?: string;
}) {
  const { whole, fraction, full } = formatYoctoSocialParts(
    valueYocto,
    fractionDigits
  );
  const useFractionLayout =
    fractionDigits > 0 && (isLiveAccruing || stableFractionLayout);

  return (
    <span
      className={cn(
        'inline-flex max-w-none shrink-0 flex-nowrap items-baseline whitespace-nowrap tabular-nums',
        className
      )}
      aria-label={`${full} SOCIAL ready to collect`}
    >
      {useFractionLayout ? (
        <>
          <span className="shrink-0 font-bold tracking-[-0.03em]">{whole}</span>
          <span className="shrink-0 font-bold leading-none opacity-90">.</span>
          <span
            className="inline-flex shrink-0 flex-nowrap text-[0.65em] font-semibold leading-none opacity-85 tabular-nums"
            style={{ minWidth: `${fractionDigits}ch` }}
            aria-hidden
          >
            {fraction.split('').map((digit, index) => (
              <LiveFractionDigit key={`fraction-${index}`} digit={digit} />
            ))}
          </span>
        </>
      ) : (
        <span className="shrink-0 font-bold">{full}</span>
      )}
      {suffix ? (
        <span className="ml-1.5 shrink-0 self-center font-medium opacity-70">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

function formatDecimalString(value: string, maxDec = 4): string {
  const normalized = finalizeAmountInput(value, STAKE_AMOUNT_MAX_DECIMALS);
  if (!normalized) return '0';

  const [rawWhole = '0', rawFraction = ''] = normalized.split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '') || '0';
  const wholeBigInt = BigInt(whole);
  const fraction = rawFraction.replace(/0+$/, '');

  if (wholeBigInt === 0n && fraction.length === 0) {
    return '0';
  }

  if (wholeBigInt >= 1_000_000n) {
    const millionsWhole = wholeBigInt / 1_000_000n;
    const millionsRemainder = wholeBigInt % 1_000_000n;
    const compactFraction = `${millionsRemainder
      .toString()
      .padStart(6, '0')}${fraction}`
      .slice(0, 2)
      .replace(/0+$/, '');

    return `${addThousandsSeparators(millionsWhole.toString())}${
      compactFraction ? `.${compactFraction}` : ''
    }M`;
  }

  const fractionDigits = wholeBigInt >= 1_000n ? Math.min(maxDec, 2) : maxDec;
  const displayFraction = fraction.slice(0, fractionDigits).replace(/0+$/, '');

  return `${addThousandsSeparators(whole)}${
    displayFraction ? `.${displayFraction}` : ''
  }`;
}

function applyLockBonus(amountYocto: bigint, bonusPct: number): bigint {
  return (amountYocto * BigInt(100 + bonusPct)) / 100n;
}

function formatTimeRemaining(nsTimestamp: number): string {
  const nowNs = Date.now() * 1_000_000;
  const remaining = nsTimestamp - nowNs;
  if (remaining <= 0) return 'Expired';

  const totalSec = Math.floor(remaining / 1_000_000_000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);

  if (days > 30) {
    const months = Math.floor(days / 30);
    const remDays = days % 30;
    return `${months}mo ${remDays}d`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Display yocto-SOCIAL as a clean human number. */
function formatSocial(yocto: string | bigint, maxDec = 4): string {
  const raw = yoctoToSocial(
    typeof yocto === 'bigint' ? yocto.toString() : yocto
  );
  return formatDecimalString(raw, maxDec);
}

function periodIndex(months: number): number {
  return LOCK_PERIODS.findIndex((lp) => lp.months === months);
}

function normalizeBoostClaimableYocto(
  claimableYocto: bigint,
  rewardsPerSecondYocto: bigint
): bigint {
  if (
    rewardsPerSecondYocto === 0n &&
    claimableYocto > 0n &&
    claimableYocto < BOOST_CLAIM_DUST_YOCTO
  ) {
    return 0n;
  }
  return claimableYocto;
}

function extrapolateLiveClaimableYocto(
  snapshot: BoostRewardsLiveSnapshot,
  atMs = Date.now()
): bigint {
  const perSecondYocto = parseYocto(snapshot.rewards_per_second);
  const anchorYocto = normalizeBoostClaimableYocto(
    parseYocto(snapshot.claimable_rewards),
    perSecondYocto
  );

  if (perSecondYocto <= 0n) {
    return anchorYocto;
  }

  const asOfNs = BigInt(snapshot.as_of_timestamp_ns);
  const atNs = BigInt(atMs) * 1_000_000n;
  const elapsedNs = atNs > asOfNs ? atNs - asOfNs : 0n;
  return anchorYocto + (perSecondYocto * elapsedNs) / 1_000_000_000n;
}

type LiveCounterAnchor = {
  baseYocto: bigint;
  clientMs: number;
  ratePerSecondYocto: bigint;
};

/** Client-side anchor avoids block-timestamp vs wall-clock jitter on resync. */
function extrapolateFromClientAnchor(
  anchor: LiveCounterAnchor,
  atMs = Date.now()
): bigint {
  const elapsedMs = Math.max(0, atMs - anchor.clientMs);
  if (anchor.ratePerSecondYocto <= 0n || elapsedMs === 0) {
    return anchor.baseYocto;
  }
  return (
    anchor.baseYocto + (anchor.ratePerSecondYocto * BigInt(elapsedMs)) / 1000n
  );
}

function BoostCollectSection({
  visibleLiveClaimableYocto,
  displayFractionDigits,
  isCounterLoading,
  isLiveAccruing,
  perSecondDisplay,
  claimCelebration,
  claimCelebrationDurationSeconds,
  reduceMotion,
  txPending,
  pendingAction,
  onClaim,
  hint,
  reserveRateSlot = false,
  stableAmountLayout = false,
  className,
}: {
  visibleLiveClaimableYocto: bigint;
  displayFractionDigits: number;
  isCounterLoading: boolean;
  isLiveAccruing: boolean;
  perSecondDisplay: string;
  claimCelebration: ClaimCelebration | null;
  claimCelebrationDurationSeconds: number;
  reduceMotion: boolean | null;
  txPending: boolean;
  pendingAction: BoostAction | null;
  onClaim: () => void;
  hint?: string;
  reserveRateSlot?: boolean;
  stableAmountLayout?: boolean;
  className?: string;
}) {
  const displayYocto = claimCelebration
    ? claimCelebration.amountYocto
    : visibleLiveClaimableYocto;

  return (
    <div
      className={cn(
        'relative flex flex-col items-center overflow-hidden rounded-2xl px-3 py-2 text-center sm:px-3.5 sm:py-2.5',
        BOOST_COLLECT_SECTION_MIN_CLASS,
        className
      )}
    >
      <CollectCelebration
        active={Boolean(claimCelebration)}
        celebrationKey={claimCelebration?.id ?? 'idle'}
        reduceMotion={reduceMotion}
        durationSeconds={claimCelebrationDurationSeconds}
        icon={<Gift className="h-3 w-3" />}
      >
        +
        {claimCelebration
          ? formatYoctoSocialFixed(
              claimCelebration.amountYocto,
              displayFractionDigits
            )
          : '0'}
      </CollectCelebration>
      <motion.div
        aria-hidden={claimCelebration ? true : undefined}
        animate={
          claimCelebration && !reduceMotion
            ? {
                opacity: 0,
                scale: 0.98,
                filter: 'blur(4px)',
              }
            : claimCelebration
              ? { opacity: 0, scale: 0.98 }
              : {
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                }
        }
        transition={{
          duration: claimCelebration ? 0.32 : 0.36,
          ease: claimCelebration ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1],
        }}
        className="flex w-full flex-col items-center"
      >
        <span className="portal-eyebrow text-muted-foreground">
          Ready to collect
        </span>
        <div
          className={cn(
            'mt-1 flex w-full items-center justify-center',
            BOOST_COLLECT_AMOUNT_ROW_CLASS
          )}
        >
          {isCounterLoading ? (
            <Skeleton
              className="h-9 w-32 sm:h-10 sm:w-36"
              aria-label="Loading collectable balance"
            />
          ) : (
            <div className="flex w-full justify-center overflow-x-auto overscroll-x-contain px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <LiveClaimableAmount
                valueYocto={displayYocto}
                fractionDigits={displayFractionDigits}
                isLiveAccruing={isLiveAccruing && !claimCelebration}
                stableFractionLayout={stableAmountLayout}
                suffix={
                  <span className="portal-type-micro uppercase tracking-wide">
                    SOCIAL
                  </span>
                }
                className="portal-green-text font-mono text-2xl font-bold tracking-[-0.03em] lg:text-3xl"
              />
            </div>
          )}
        </div>
        {(isLiveAccruing || claimCelebration || reserveRateSlot) && (
          <div
            className={cn(
              'flex w-full items-center justify-center',
              BOOST_COLLECT_RATE_ROW_CLASS
            )}
          >
            {isCounterLoading ? (
              <Skeleton className="h-3.5 w-20" aria-hidden />
            ) : claimCelebration ? (
              <span
                className="invisible font-mono portal-type-micro"
                aria-hidden
              >
                +{perSecondDisplay}/sec
              </span>
            ) : isLiveAccruing ? (
              <p className="font-mono portal-type-micro text-muted-foreground">
                +{perSecondDisplay}/sec
              </p>
            ) : (
              <span
                className="invisible font-mono portal-type-micro"
                aria-hidden
              >
                +0/sec
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            'mt-2 flex w-full items-center justify-center',
            BOOST_COLLECT_ACTION_ROW_CLASS
          )}
        >
          <Button
            onClick={onClaim}
            disabled={
              isCounterLoading ||
              txPending ||
              visibleLiveClaimableYocto < BOOST_CLAIM_DUST_YOCTO
            }
            variant="accent"
            size="sm"
            className="min-w-[8rem] justify-center"
            loading={txPending && pendingAction === 'claim'}
          >
            <Gift className="h-3.5 w-3.5" />
            Collect
          </Button>
        </div>
        {hint ? (
          <p className="mt-2 max-w-xs portal-type-label leading-relaxed text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function BoostPage() {
  const {
    wallet,
    accountId,
    isConnected,
    isLoading: isWalletBootstrapping,
    connect,
    getSigningWallet,
  } = useWallet();
  const heroRef = useRef(null);
  const loadedAccountIdRef = useRef<string | null>(null);
  const isInView = useInView(heroRef, { once: true, amount: 0.1 });
  const reduceMotion = useReducedMotion();

  // ── Calculator state ──
  const [selectedPeriod, setSelectedPeriod] = useState(2); // default 12mo
  const [stakeAmount, setStakeAmount] = useState('');

  // ── On-chain data ──
  const [loadedAccount, setLoadedAccount] = useState<BoostAccountView | null>(
    null
  );
  const [loadedLockStatus, setLoadedLockStatus] =
    useState<BoostLockStatus | null>(null);
  const [stats, setStats] = useState<BoostStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [boosterCount, setBoosterCount] = useState<number | null>(null);
  const [loadedLiveSnapshot, setLoadedLiveSnapshot] =
    useState<BoostRewardsLiveSnapshot | null>(null);
  const [loadedTokenBalance, setLoadedTokenBalance] = useState('0');
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const hasStatsLoadedRef = useRef(false);
  const [liveResyncKey, setLiveResyncKey] = useState(0);
  const tabHiddenAtRef = useRef<number | null>(null);

  // ── Live reward counter ──
  const [liveClaimableYocto, setLiveClaimableYocto] = useState(0n);
  const liveClaimableYoctoRef = useRef(0n);
  const liveCounterAnchorRef = useRef<LiveCounterAnchor | null>(null);
  const liveCounterPausedRef = useRef(false);
  const lastConfirmedActionRef = useRef<BoostAction | null>(null);
  const postClaimRefreshPendingRef = useRef(false);
  const hasLoadedAccountData =
    accountId !== null && loadedAccountIdRef.current === accountId;
  const isAccountResolving =
    isWalletBootstrapping || (Boolean(accountId) && !hasLoadedAccountData);
  const account = hasLoadedAccountData ? loadedAccount : null;
  const lockStatus = hasLoadedAccountData ? loadedLockStatus : null;
  const liveSnapshot = hasLoadedAccountData ? loadedLiveSnapshot : null;
  const tokenBalance = hasLoadedAccountData ? loadedTokenBalance : '0';
  const hasLiveCounterData = hasLoadedAccountData && liveSnapshot !== null;
  const isCounterLoading = Boolean(accountId) && !hasLiveCounterData;
  const visibleLiveClaimableYocto = hasLiveCounterData
    ? liveClaimableYocto
    : 0n;

  // ── Transaction state ──
  const [txPending, setTxPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<BoostAction | null>(null);
  const [claimCelebration, setClaimCelebration] =
    useState<ClaimCelebration | null>(null);
  const claimCelebrationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  // ── Extend lock UI ──
  const [showExtend, setShowExtend] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  const [showIncrease, setShowIncrease] = useState(false);

  const openIncreasePanel = useCallback(() => {
    setShowRenew(false);
    setShowExtend(false);
    setShowIncrease((open) => {
      if (open) setStakeAmount('');
      return !open;
    });
  }, []);

  const openRenewPanel = useCallback(() => {
    setShowIncrease(false);
    setShowExtend(false);
    setStakeAmount('');
    setShowRenew((open) => !open);
  }, []);

  const openExtendPanel = useCallback(() => {
    setShowIncrease(false);
    setShowRenew(false);
    setStakeAmount('');
    setShowExtend((open) => !open);
  }, []);

  // ── Computed ──
  const period = LOCK_PERIODS[selectedPeriod];
  const normalizedStakeAmount = finalizeAmountInput(
    stakeAmount,
    STAKE_AMOUNT_INPUT_DECIMALS
  );
  const stakeAmountYocto = BigInt(socialToYocto(normalizedStakeAmount || '0'));
  const enteredStakeAmount = stakeAmountYocto > 0n;
  const minimumStakeYocto = BigInt(socialToYocto(MIN_STAKE_AMOUNT));
  const effectiveStakeYocto = applyLockBonus(stakeAmountYocto, period.bonus);
  const hasStake = account && BigInt(account.locked_amount) > 0n;
  const showCommitmentPanel = isAccountResolving || Boolean(hasStake);
  const showCommitPanel = !showCommitmentPanel;
  const lockedAmountYocto = hasStake ? BigInt(account.locked_amount) : 0n;
  const newTotalLockedYocto = lockedAmountYocto + stakeAmountYocto;
  const newEffectiveStakeYocto = applyLockBonus(
    newTotalLockedYocto,
    period.bonus
  );
  const isBelowMinimumStake =
    enteredStakeAmount && stakeAmountYocto < minimumStakeYocto;
  const lockExpired =
    hasStake &&
    (lockStatus?.lock_expired ??
      (account.unlock_at > 0 && Date.now() * 1_000_000 >= account.unlock_at));
  const canUnlock = hasStake && (lockStatus?.can_unlock ?? lockExpired);
  const currentPeriodIdx = hasStake ? periodIndex(account.lock_months) : -1;
  const canAddStake = !hasStake || currentPeriodIdx >= 0;
  const balanceYocto = BigInt(tokenBalance);
  const balanceDisplay = formatSocial(balanceYocto);
  const hasInsufficientBalance =
    enteredStakeAmount && stakeAmountYocto > balanceYocto;
  const totalEffectiveStakeYocto = stats
    ? BigInt(stats.total_effective_boost)
    : 0n;
  const scheduledPoolYocto = stats ? BigInt(stats.scheduled_pool) : 0n;
  const hasZeroBalance = balanceYocto === 0n;
  const isStakeInputMissing = !enteredStakeAmount;
  const isStakeActionDisabled =
    txPending ||
    isWalletBootstrapping ||
    (isConnected &&
      (isStakeInputMissing ||
        isBelowMinimumStake ||
        hasInsufficientBalance ||
        !canAddStake));
  const stakeButtonLabel = portalConnectButtonLabel('boost', {
    isWalletBootstrapping,
    isConnected,
    connectedLabel: hasZeroBalance
      ? 'No SOCIAL available'
      : isStakeInputMissing
        ? 'Enter amount'
        : hasStake && !canAddStake
          ? 'Commitment needs migration'
          : hasStake
            ? 'Increase'
            : 'Commit',
  });
  const claimCelebrationDurationSeconds = reduceMotion ? 1.15 : 1.75;

  const clearClaimCelebration = useCallback(() => {
    if (claimCelebrationTimeoutRef.current) {
      clearTimeout(claimCelebrationTimeoutRef.current);
      claimCelebrationTimeoutRef.current = null;
    }
    setClaimCelebration(null);
  }, []);

  const triggerClaimCelebration = useCallback(
    (amountYocto: bigint) => {
      if (amountYocto <= 0n) return;

      if (claimCelebrationTimeoutRef.current) {
        clearTimeout(claimCelebrationTimeoutRef.current);
      }

      const id = Date.now();
      setClaimCelebration({ id, amountYocto });
      claimCelebrationTimeoutRef.current = setTimeout(
        () => {
          setClaimCelebration((current) =>
            current?.id === id ? null : current
          );
          claimCelebrationTimeoutRef.current = null;
        },
        reduceMotion
          ? REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS
          : CLAIM_CELEBRATION_TIMEOUT_MS
      );
    },
    [reduceMotion]
  );

  useEffect(
    () => () => {
      if (claimCelebrationTimeoutRef.current) {
        clearTimeout(claimCelebrationTimeoutRef.current);
      }
    },
    []
  );

  useLayoutEffect(() => {
    if (accountId) return;

    setStakeAmount('');
    setSelectedPeriod(2);
    setShowExtend(false);
    setShowRenew(false);
    setShowIncrease(false);
    clearClaimCelebration();
    clearTxResult();
    setDataLoading(false);
  }, [accountId, clearClaimCelebration, clearTxResult]);

  // ── Data Fetching ──

  // Always fetch stats (public data). Only show pulse skeleton on first load.
  useEffect(() => {
    let cancelled = false;
    if (!hasStatsLoadedRef.current) {
      setStatsLoading(true);
    }

    void Promise.all([
      os.boost.getStats().catch(() => null),
      fetchActiveBoosterCount().catch(() => 0),
    ])
      .then(([nextStats, nextBoosterCount]) => {
        if (cancelled) return;
        if (nextStats) {
          setStats(nextStats);
          hasStatsLoadedRef.current = true;
        }
        setBoosterCount(nextBoosterCount);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    os.token
      .metadata()
      .then((metadata) => {
        if (metadata?.icon) {
          setTokenIconSrc(metadata.icon);
        }
      })
      .catch(() => {});
  }, []);

  // ── Live reward counter ──
  const setLiveClaimableYoctoValue = useCallback((value: bigint) => {
    liveClaimableYoctoRef.current = value;
    setLiveClaimableYocto(value);
  }, []);

  const applyLiveSnapshotToCounter = useCallback(
    (
      snapshot: BoostRewardsLiveSnapshot,
      options: { allowDecrease: boolean }
    ) => {
      const ratePerSecondYocto = parseYocto(snapshot.rewards_per_second);
      const chainAtNow = extrapolateLiveClaimableYocto(snapshot, Date.now());
      const displayed = liveClaimableYoctoRef.current;
      const baseYocto = options.allowDecrease
        ? chainAtNow
        : chainAtNow > displayed
          ? chainAtNow
          : displayed;

      liveCounterAnchorRef.current = {
        baseYocto,
        clientMs: Date.now(),
        ratePerSecondYocto,
      };

      setLiveClaimableYoctoValue(
        ratePerSecondYocto > 0n
          ? extrapolateFromClientAnchor(liveCounterAnchorRef.current)
          : baseYocto
      );
    },
    [setLiveClaimableYoctoValue]
  );

  // Fetch account, lock, and balance when connected or after transactions.
  useEffect(() => {
    if (!accountId) {
      setLoadedAccount(null);
      setLoadedLockStatus(null);
      setLoadedLiveSnapshot(null);
      setLoadedTokenBalance('0');
      setLiveClaimableYoctoValue(0n);
      liveCounterAnchorRef.current = null;
      liveCounterPausedRef.current = false;
      lastConfirmedActionRef.current = null;
      postClaimRefreshPendingRef.current = false;
      tabHiddenAtRef.current = null;
      loadedAccountIdRef.current = null;
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    const requestedAccountId = accountId;
    const isInitialLoadForAccount =
      loadedAccountIdRef.current !== requestedAccountId;

    if (isInitialLoadForAccount) {
      setLoadedAccount(null);
      setLoadedLockStatus(null);
      setLoadedLiveSnapshot(null);
      setLoadedTokenBalance('0');
      setStakeAmount('');
      setSelectedPeriod(2);
      setShowExtend(false);
      setShowRenew(false);
      clearClaimCelebration();
      setLiveClaimableYoctoValue(0n);
      liveCounterAnchorRef.current = null;
      liveCounterPausedRef.current = false;
      lastConfirmedActionRef.current = null;
      postClaimRefreshPendingRef.current = false;
      setDataLoading(true);
    }

    Promise.all([
      os.boost.getAccount(requestedAccountId),
      os.boost.getLockStatus(requestedAccountId),
      os.token.balanceOf(requestedAccountId),
      os.boost.getRewardsLiveSnapshot(requestedAccountId),
    ])
      .then(([acct, status, bal, snapshot]) => {
        if (cancelled) return;

        loadedAccountIdRef.current = requestedAccountId;
        setLoadedAccount(acct);
        setLoadedLockStatus(status);
        setLoadedTokenBalance(bal ?? '0');
        setLoadedLiveSnapshot(snapshot);
        if (postClaimRefreshPendingRef.current) {
          postClaimRefreshPendingRef.current = false;
        }

        // Auto-select current lock period
        if (acct && BigInt(acct.locked_amount) > 0n) {
          const idx = periodIndex(acct.lock_months);
          if (idx >= 0) setSelectedPeriod(idx);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          loadedAccountIdRef.current = requestedAccountId;
          setLoadedAccount(null);
          setLoadedLockStatus(null);
          setLoadedLiveSnapshot(null);
          setLoadedTokenBalance('0');
          postClaimRefreshPendingRef.current = false;
        }
      })
      .finally(() => {
        if (!cancelled && isInitialLoadForAccount) {
          setDataLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    clearClaimCelebration,
    refreshKey,
    setLiveClaimableYoctoValue,
  ]);

  // Lightweight live-counter resync (one contract view via gateway).
  useEffect(() => {
    if (!accountId || !hasLoadedAccountData || liveResyncKey === 0) return;

    let cancelled = false;
    const requestedAccountId = accountId;

    os.boost
      .getRewardsLiveSnapshot(requestedAccountId)
      .then((snapshot) => {
        if (!cancelled && loadedAccountIdRef.current === requestedAccountId) {
          setLoadedLiveSnapshot(snapshot);
        }
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, hasLoadedAccountData, liveResyncKey]);

  // Periodic resync + focus resync only after a long background (keeps counter smooth).
  useEffect(() => {
    if (!accountId) return;

    const interval = setInterval(() => {
      setLiveResyncKey((key) => key + 1);
    }, BOOST_CHAIN_RESYNC_MS);

    const resyncOnFocus = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState !== 'visible') return;

      const hiddenAt = tabHiddenAtRef.current;
      tabHiddenAtRef.current = null;
      if (hiddenAt === null) return;

      if (Date.now() - hiddenAt >= BOOST_FOCUS_RESYNC_MS) {
        setLiveResyncKey((key) => key + 1);
      }
    };
    document.addEventListener('visibilitychange', resyncOnFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', resyncOnFocus);
    };
  }, [accountId]);

  useEffect(() => {
    if (!liveSnapshot || claimCelebration) {
      return;
    }

    const pendingResetAction = lastConfirmedActionRef.current;
    const resetAfterClaim =
      pendingResetAction === 'claim' || pendingResetAction === 'unlock';

    if (resetAfterClaim && postClaimRefreshPendingRef.current) {
      return;
    }

    if (resetAfterClaim) {
      lastConfirmedActionRef.current = null;
    }
    liveCounterPausedRef.current = false;

    applyLiveSnapshotToCounter(liveSnapshot, {
      allowDecrease: resetAfterClaim,
    });
  }, [applyLiveSnapshotToCounter, claimCelebration, liveSnapshot]);

  useEffect(() => {
    if (!hasLiveCounterData || !liveCounterAnchorRef.current) {
      return;
    }

    const ratePerSecondYocto = liveCounterAnchorRef.current.ratePerSecondYocto;
    if (ratePerSecondYocto <= 0n) {
      return;
    }

    const tick = () => {
      if (liveCounterPausedRef.current || !liveCounterAnchorRef.current) {
        return;
      }
      const next = extrapolateFromClientAnchor(liveCounterAnchorRef.current);
      if (next >= liveClaimableYoctoRef.current) {
        setLiveClaimableYoctoValue(next);
      }
    };

    tick();
    const interval = setInterval(tick, LIVE_COUNTER_TICK_MS);
    return () => clearInterval(interval);
  }, [
    hasLiveCounterData,
    liveSnapshot?.rewards_per_second,
    setLiveClaimableYoctoValue,
  ]);

  // ── Transaction Helpers ──

  const afterTx = useCallback(() => {
    // Immediate refresh (includes live snapshot).
    setRefreshKey((k) => k + 1);
    // RPC nodes may serve stale reads right after a tx;
    // schedule two more refreshes to catch the updated state.
    setTimeout(() => setRefreshKey((k) => k + 1), 1500);
    setTimeout(() => setRefreshKey((k) => k + 1), 4000);
  }, []);

  const runTx = useCallback(
    async (
      action: BoostAction,
      messages: {
        submitted: string;
        success: string;
        failure: string;
      },
      fn: (
        signingWallet: NonNullable<typeof wallet>,
        signerId: string
      ) => Promise<unknown>
    ) => {
      setTxPending(true);
      setPendingAction(action);
      clearTxResult();
      try {
        const { wallet: signingWallet, accountId: signingAccountId } =
          await getSigningWallet();
        const accounts = await signingWallet.getAccounts({
          network: ACTIVE_NEAR_NETWORK,
        });
        const walletAccountIds = accounts.map((account) => account.accountId);
        if (!walletAccountIds.includes(signingAccountId)) {
          throw new Error(
            `Wallet account mismatch. Portal is connected as ${signingAccountId}, but the wallet is using ${walletAccountIds.join(', ') || 'no account'}. Switch the wallet account or reconnect before signing.`
          );
        }
        const result = await fn(signingWallet, signingAccountId);
        const txHashes = extractNearTransactionHashes(result);
        if (txHashes.length === 0) {
          throw new Error(
            'Wallet submitted the transaction but no tx hash was returned'
          );
        }
        const confirmed = await trackTransaction({
          txHashes,
          submittedMessage: messages.submitted,
          successMessage: messages.success,
          failureMessage: messages.failure,
        });
        if (confirmed) {
          lastConfirmedActionRef.current = action;
          if (action === 'claim' || action === 'unlock') {
            postClaimRefreshPendingRef.current = true;
            liveCounterPausedRef.current = true;
            if (action === 'claim') {
              triggerClaimCelebration(liveClaimableYoctoRef.current);
            }
          }
          afterTx();
        }
      } catch (e) {
        setTxResult({
          type: 'error',
          msg: e instanceof Error ? e.message : 'Transaction failed',
        });
      } finally {
        setTxPending(false);
        setPendingAction(null);
      }
    },
    [
      afterTx,
      clearTxResult,
      getSigningWallet,
      setLiveClaimableYoctoValue,
      setTxResult,
      trackTransaction,
      triggerClaimCelebration,
    ]
  );

  // ── Actions ──

  const handleStakeAmountChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setStakeAmount(
        normalizeAmountInput(event.target.value, STAKE_AMOUNT_INPUT_DECIMALS)
      );
    },
    []
  );

  const handleStakeAmountBlur = useCallback(() => {
    setStakeAmount((current) =>
      finalizeAmountInput(current, STAKE_AMOUNT_INPUT_DECIMALS)
    );
  }, []);

  const handleMaxStakeAmount = useCallback(() => {
    setStakeAmount(
      finalizeAmountInput(
        yoctoToSocial(tokenBalance),
        STAKE_AMOUNT_INPUT_DECIMALS
      )
    );
  }, [tokenBalance]);

  const handleStake = () => {
    if (!wallet || !accountId) return connect();
    if (stakeAmountYocto < minimumStakeYocto) return;

    const yocto = socialToYocto(normalizedStakeAmount);
    if (BigInt(yocto) > balanceYocto) {
      setTxResult({ type: 'error', msg: 'Insufficient SOCIAL balance' });
      return;
    }

    runTx(
      'stake',
      {
        submitted: 'Submitting boost…',
        success: isOpeningFirstRelease
          ? `Activated first release with ${normalizedStakeAmount} SOCIAL.`
          : `Committed ${normalizedStakeAmount} SOCIAL for ${period.label}.`,
        failure: 'Boost update failed.',
      },
      async (signingWallet, signerId) => {
        const result = await signingWallet.signAndSendTransaction({
          network: ACTIVE_NEAR_NETWORK,
          signerId,
          receiverId: TOKEN_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'ft_transfer_call',
                args: {
                  receiver_id: BOOST_CONTRACT,
                  amount: yocto,
                  msg: JSON.stringify({
                    action: 'lock',
                    months: period.months,
                  }),
                },
                gas: '80000000000000',
                deposit: '1',
              },
            },
          ],
        });
        setStakeAmount('');
        setShowIncrease(false);
        return result;
      }
    );
  };

  const handleClaim = () => {
    if (!wallet) return;
    runTx(
      'claim',
      {
        submitted: txToastPending.collectingBoost,
        success: txToastSuccess.boostCollected,
        failure: 'Collection failed.',
      },
      async (signingWallet, signerId) =>
        signingWallet.signAndSendTransaction({
          network: ACTIVE_NEAR_NETWORK,
          signerId,
          receiverId: BOOST_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'claim_rewards',
                args: {},
                gas: '80000000000000',
                deposit: '0',
              },
            },
          ],
        })
    );
  };

  const handleUnlock = () => {
    if (!wallet) return;
    runTx(
      'unlock',
      {
        submitted: 'Releasing…',
        success: 'Position released and SOCIAL collected.',
        failure: 'Release failed.',
      },
      async (signingWallet, signerId) =>
        signingWallet.signAndSendTransaction({
          network: ACTIVE_NEAR_NETWORK,
          signerId,
          receiverId: BOOST_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'unlock',
                args: {},
                gas: '80000000000000',
                deposit: '0',
              },
            },
          ],
        })
    );
  };

  const handleExtend = (months: number) => {
    if (!wallet) return;
    const lp = LOCK_PERIODS.find((p) => p.months === months);
    runTx(
      `extend:${months}`,
      {
        submitted: 'Extending…',
        success: `Extended to ${lp?.label ?? months + ' months'}.`,
        failure: 'Extension failed.',
      },
      async (signingWallet, signerId) => {
        const result = await signingWallet.signAndSendTransaction({
          network: ACTIVE_NEAR_NETWORK,
          signerId,
          receiverId: BOOST_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'extend_lock',
                args: { months },
                gas: '30000000000000',
                deposit: '0',
              },
            },
          ],
        });
        setShowExtend(false);
        return result;
      }
    );
  };

  const handleRenew = () => {
    if (!wallet) return;
    runTx(
      'renew',
      {
        submitted: 'Renewing…',
        success: 'Commitment renewed!',
        failure: 'Renewal failed.',
      },
      async (signingWallet, signerId) => {
        const result = await signingWallet.signAndSendTransaction({
          network: ACTIVE_NEAR_NETWORK,
          signerId,
          receiverId: BOOST_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'renew_lock',
                args: {},
                gas: '30000000000000',
                deposit: '0',
              },
            },
          ],
        });
        setShowRenew(false);
        return result;
      }
    );
  };

  // ── Extend options (periods longer than current) ──
  const extendOptions = hasStake
    ? LOCK_PERIODS.filter((lp) => lp.months > account.lock_months)
    : [];

  // ── User share ──
  const userSharePct =
    account && totalEffectiveStakeYocto > 0n
      ? Number(
          (BigInt(account.effective_boost) * 10000n) / totalEffectiveStakeYocto
        ) / 100
      : 0;
  const isSoleReleaseContributor =
    !!account &&
    scheduledPoolYocto > 0n &&
    totalEffectiveStakeYocto > 0n &&
    BigInt(account.effective_boost) === totalEffectiveStakeYocto;
  const isOpeningFirstRelease =
    !hasStake && scheduledPoolYocto > 0n && totalEffectiveStakeYocto === 0n;

  // ── Reward rate per second ──
  const perSecond = liveSnapshot
    ? parseFloat(yoctoToSocial(liveSnapshot.rewards_per_second))
    : 0;
  const perSecondYocto = liveSnapshot
    ? parseYocto(liveSnapshot.rewards_per_second)
    : 0n;
  const perSecondDisplay = formatYoctoSocialFixed(
    perSecondYocto,
    REWARD_RATE_FRACTION_DIGITS
  );
  const shouldLiveAccrueRewards = hasStake && perSecondYocto > 0n;
  const dailyRewardEstimate = perSecond > 0 ? perSecond * 86400 : 0;
  const publicWeeklyReleaseYocto =
    stats?.active_weekly_rate_bps !== null &&
    stats?.active_weekly_rate_bps !== undefined
      ? (scheduledPoolYocto * BigInt(stats.active_weekly_rate_bps)) / 10000n
      : 0n;
  const publicWeeklyReleaseDisplay = formatSocial(publicWeeklyReleaseYocto);
  const activeWeeklyRateDisplay =
    stats?.active_weekly_rate_bps !== null &&
    stats?.active_weekly_rate_bps !== undefined
      ? `${(stats.active_weekly_rate_bps / 100).toFixed(2)}%/wk`
      : '—';
  const positionItems = hasStake
    ? [
        {
          label: 'Share',
          value: userSharePct > 0 ? `${userSharePct.toFixed(2)}%` : '—',
        },
        {
          label: 'Rate',
          value: activeWeeklyRateDisplay,
        },
        {
          label: 'Accruing',
          value: `${dailyRewardEstimate.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}/day`,
        },
      ]
    : [];

  const commitmentNetworkItems = hasStake
    ? positionItems.map((item) => ({
        label: item.label,
        value: item.value,
        tone:
          item.label === 'Rate'
            ? ('gold' as const)
            : item.label === 'Accruing'
              ? ('purple' as const)
              : undefined,
      }))
    : [];

  const previewUnlockDate = (() => {
    const unlockDate = new Date();
    unlockDate.setMonth(unlockDate.getMonth() + period.months);
    return unlockDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  })();

  const stakeAmountPreview = {
    showCurrentRows: Boolean(hasStake),
    currentLocked: hasStake ? formatSocial(account.locked_amount) : '',
    addingAmount: `+${formatSocial(stakeAmountYocto)}`,
    totalLocked: hasStake
      ? formatSocial(newTotalLockedYocto)
      : formatSocial(stakeAmountYocto),
    periodShort: period.short,
    periodBonus: period.bonus,
    periodColor: period.color,
    influence: hasStake
      ? formatSocial(newEffectiveStakeYocto, 2)
      : formatSocial(effectiveStakeYocto, 2),
  };

  return (
    <PageShell className="max-w-6xl">
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />

      <BoostPageColumn>
        <div className="max-md:hidden">
          <BoostPageIntro />
        </div>

        <div ref={heroRef}>
          <BoostNetworkPulse
            boosterCount={boosterCount}
            totalLockedYocto={stats?.total_locked ?? '0'}
            scheduledPoolYocto={stats?.scheduled_pool ?? '0'}
            activeWeeklyRateBps={stats?.active_weekly_rate_bps ?? null}
            loading={statsLoading}
          />
        </div>

        <AnimatePresence initial={false}>
          {showCommitmentPanel ? (
            <motion.div
              key="position-panel-shell"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'w-full',
                (dataLoading || isAccountResolving) && 'min-h-[12rem]'
              )}
            >
              <AnimatePresence initial={false} mode="wait">
                {dataLoading || isAccountResolving ? (
                  <motion.div
                    key="position-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="h-full min-h-[12rem]"
                  >
                    <BoostCommitmentPanelSkeleton />
                  </motion.div>
                ) : hasStake && account ? (
                  <motion.div
                    key="position-content"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                    className="h-full"
                  >
                    <SurfacePanel
                      radius="xl"
                      tone="soft"
                      className={cn('h-full', BOOST_PANEL_PADDING_CLASS)}
                    >
                      {/* ── Header ── */}
                      <div className="flex items-center justify-between gap-3">
                        <BoostPanelSectionTitle>
                          Commitment
                        </BoostPanelSectionTitle>
                        <div className="flex items-center gap-2">
                          {canUnlock ? (
                            <PortalBadge accent="gold" size="sm">
                              Complete
                            </PortalBadge>
                          ) : (
                            <PortalBadge
                              accent="neutral"
                              size="sm"
                              className="gap-1.5"
                            >
                              <Timer className="h-3 w-3" />
                              {formatTimeRemaining(account.unlock_at)}
                            </PortalBadge>
                          )}
                        </div>
                      </div>

                      <BoostCommitmentSummary
                        lockedYocto={account.locked_amount}
                        influenceYocto={account.effective_boost}
                        unlockAtNs={account.unlock_at}
                        canUnlock={canUnlock}
                        networkItems={commitmentNetworkItems}
                        collectedYocto={account.rewards_claimed}
                        reserveCollectedSlot
                        reserveNetworkSlot
                      />

                      <BoostCollectSection
                        className={cn('mt-0', BOOST_PANEL_DIVIDER_CLASS)}
                        visibleLiveClaimableYocto={visibleLiveClaimableYocto}
                        displayFractionDigits={
                          LIVE_COUNTER_DISPLAY_FRACTION_DIGITS
                        }
                        isCounterLoading={isCounterLoading}
                        isLiveAccruing={shouldLiveAccrueRewards === true}
                        perSecondDisplay={perSecondDisplay}
                        claimCelebration={claimCelebration}
                        claimCelebrationDurationSeconds={
                          claimCelebrationDurationSeconds
                        }
                        reduceMotion={reduceMotion}
                        txPending={txPending}
                        pendingAction={pendingAction}
                        onClaim={handleClaim}
                        reserveRateSlot={shouldLiveAccrueRewards === true}
                        stableAmountLayout
                      />

                      {isSoleReleaseContributor ? (
                        <p className="mt-2 text-center portal-type-label text-muted-foreground">
                          You are the only contributor — receiving 100% of the
                          weekly flow.
                        </p>
                      ) : null}

                      {/* ── Actions ── */}
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {canUnlock ? (
                          <Button
                            onClick={handleUnlock}
                            disabled={txPending}
                            size="lg"
                            className="w-full gap-1.5 font-semibold"
                            loading={txPending && pendingAction === 'unlock'}
                          >
                            <Unlock className="h-4 w-4" />
                            Unlock + collect
                          </Button>
                        ) : (
                          <>
                            {canAddStake ? (
                              <Button
                                onClick={openIncreasePanel}
                                disabled={txPending}
                                variant={showIncrease ? 'secondary' : 'outline'}
                                size="sm"
                                className="gap-1.5"
                              >
                                <Lock className="h-3.5 w-3.5" />
                                Increase
                              </Button>
                            ) : null}
                            <Button
                              onClick={openRenewPanel}
                              disabled={txPending}
                              variant={showRenew ? 'secondary' : 'outline'}
                              size="sm"
                              className="gap-1.5"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Renew
                            </Button>
                            {extendOptions.length > 0 ? (
                              <Button
                                onClick={openExtendPanel}
                                disabled={txPending}
                                variant={showExtend ? 'secondary' : 'outline'}
                                size="sm"
                                className="gap-1.5"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                Extend
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>

                      <AnimatePresence initial={false}>
                        {showIncrease && canAddStake ? (
                          <motion.div
                            key="increase-panel"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className={BOOST_PANEL_DIVIDER_CLASS}>
                              <p className="mb-2.5 text-center portal-type-micro text-muted-foreground">
                                Keeps {period.short} (+{period.bonus}%).
                              </p>
                              <BoostStakeAmountSection
                                mode="increase"
                                stakeAmount={stakeAmount}
                                onStakeAmountChange={handleStakeAmountChange}
                                onStakeAmountBlur={handleStakeAmountBlur}
                                onMaxAmount={handleMaxStakeAmount}
                                balanceDisplay={balanceDisplay}
                                showBalance={isConnected}
                                tokenIconSrc={tokenIconSrc}
                                onTokenIconError={() => setTokenIconSrc(null)}
                                isBelowMinimumStake={Boolean(
                                  isBelowMinimumStake
                                )}
                                hasInsufficientBalance={Boolean(
                                  hasInsufficientBalance
                                )}
                                enteredStakeAmount={enteredStakeAmount}
                                preview={stakeAmountPreview}
                                unlockDateLabel={previewUnlockDate}
                                stakeButtonLabel={stakeButtonLabel}
                                onStake={handleStake}
                                isStakeActionDisabled={isStakeActionDisabled}
                                txPending={
                                  txPending && pendingAction === 'stake'
                                }
                                footerNote="Same period. Timer resets from today."
                                showUnlockPreview={false}
                              />
                            </div>
                          </motion.div>
                        ) : null}

                        {showRenew && (
                          <motion.div
                            key="renew-panel"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div
                              className={cn(
                                BOOST_PANEL_DIVIDER_CLASS,
                                'text-center'
                              )}
                            >
                              <p className="mb-2.5 text-xs text-muted-foreground">
                                Restart your{' '}
                                {LOCK_PERIODS.find(
                                  (period) =>
                                    period.months === account.lock_months
                                )?.label ??
                                  `${account.lock_months} ${account.lock_months === 1 ? 'Month' : 'Months'}`}{' '}
                                commitment from today.
                              </p>
                              <Button
                                onClick={handleRenew}
                                disabled={txPending}
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                loading={txPending && pendingAction === 'renew'}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Confirm
                              </Button>
                            </div>
                          </motion.div>
                        )}

                        {showExtend && extendOptions.length > 0 && (
                          <motion.div
                            key="extend-panel"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div
                              className={cn(
                                BOOST_PANEL_DIVIDER_CLASS,
                                'text-center'
                              )}
                            >
                              <p className="mb-2.5 text-xs text-muted-foreground">
                                Upgrade to a longer period (resets from today):
                              </p>
                              <div className="flex flex-wrap justify-center gap-2">
                                {extendOptions.map((lp) => (
                                  <Button
                                    key={lp.months}
                                    onClick={() => handleExtend(lp.months)}
                                    disabled={txPending}
                                    variant="outline"
                                    size="sm"
                                    loading={
                                      txPending &&
                                      pendingAction === `extend:${lp.months}`
                                    }
                                  >
                                    {lp.short}{' '}
                                    <span
                                      className="ml-1 font-mono"
                                      style={{ color: lp.color }}
                                    >
                                      +{lp.bonus}%
                                    </span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </SurfacePanel>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {showCommitPanel ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full"
          >
            <SurfacePanel
              radius="xl"
              tone="soft"
              padding="none"
              className={BOOST_PANEL_PADDING_CLASS}
            >
              <BoostPanelSectionTitle className="mb-2.5">
                Commit
              </BoostPanelSectionTitle>

              <div>
                <BoostPanelSectionTitle className="mb-2">
                  Lock period
                </BoostPanelSectionTitle>
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {LOCK_PERIODS.map((lp, index) => (
                    <button
                      type="button"
                      key={lp.months}
                      onClick={() => setSelectedPeriod(index)}
                      className={cn(
                        'relative min-h-11 rounded-xl border px-1 py-2.5 text-center transition-all sm:px-2 sm:py-3',
                        selectedPeriod === index
                          ? 'portal-blue-surface border-[var(--portal-blue-border-strong)] portal-blue-text shadow-sm'
                          : 'border-border/50 bg-background/40 hover:border-border hover:bg-background/55'
                      )}
                    >
                      <div>
                        <div className="mb-0.5 text-xs font-semibold">
                          {lp.short}
                        </div>
                        <div
                          className="text-sm font-bold sm:text-base"
                          style={{ color: lp.color }}
                        >
                          +{lp.bonus}%
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={BOOST_PANEL_DIVIDER_CLASS}>
                <BoostStakeAmountSection
                  mode="new"
                  stakeAmount={stakeAmount}
                  onStakeAmountChange={handleStakeAmountChange}
                  onStakeAmountBlur={handleStakeAmountBlur}
                  onMaxAmount={handleMaxStakeAmount}
                  balanceDisplay={balanceDisplay}
                  showBalance={isConnected && balanceYocto > 0n}
                  tokenIconSrc={tokenIconSrc}
                  onTokenIconError={() => setTokenIconSrc(null)}
                  isBelowMinimumStake={Boolean(isBelowMinimumStake)}
                  hasInsufficientBalance={Boolean(hasInsufficientBalance)}
                  enteredStakeAmount={enteredStakeAmount}
                  preview={stakeAmountPreview}
                  unlockDateLabel={previewUnlockDate}
                  stakeButtonLabel={stakeButtonLabel}
                  onStake={handleStake}
                  isStakeActionDisabled={isStakeActionDisabled}
                  txPending={txPending && pendingAction === 'stake'}
                  footerNote={
                    isConnected
                      ? 'One period. Locked until unlock; collect anytime.'
                      : undefined
                  }
                  amountInputDisabled={!isConnected || isWalletBootstrapping}
                />
              </div>
            </SurfacePanel>
          </motion.div>
        ) : null}

        <BoostHowItWorks />
      </BoostPageColumn>
    </PageShell>
  );
}
