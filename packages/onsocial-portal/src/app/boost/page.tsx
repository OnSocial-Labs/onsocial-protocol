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
  Calendar,
  Info,
  Lock,
  Shield,
  Zap,
  TrendingUp,
  Gift,
  RefreshCw,
  ArrowUpRight,
  Unlock,
  Timer,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { BoostSocialLayer } from '@/components/boost/boost-social-layer';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
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
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { portalColors } from '@/lib/portal-colors';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
} from '@/lib/portal-config';
import { cn } from '@/lib/utils';
import type {
  BoostAccountView,
  BoostContractStats as BoostStats,
  BoostLockStatus,
  BoostRewardRate,
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

const STAKE_AMOUNT_MAX_DECIMALS = 18;
const MIN_STAKE_AMOUNT = '0.01';
const SOCIAL_DECIMALS = 18;
const YOCTO_PER_SOCIAL = 10n ** BigInt(SOCIAL_DECIMALS);
/** Exact yocto math; display uses fewer digits for a calmer live counter. */
const LIVE_COUNTER_FRACTION_DIGITS = 6;
const LIVE_COUNTER_DISPLAY_FRACTION_DIGITS = 4;
const REWARD_RATE_FRACTION_DIGITS = 4;
const LIVE_COUNTER_TICK_MS = 100;
const BOOST_CHAIN_RESYNC_MS = 30_000;
const CLAIM_CELEBRATION_TIMEOUT_MS = 2100;
const REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS = 1400;
/** Hero collect panel hidden below this (0.0001 SOCIAL). */
const BOOST_CLAIM_DUST_YOCTO = 100_000_000_000_000_000n;
type BoostAction = 'stake' | 'claim' | 'unlock' | 'renew' | `extend:${number}`;
type ClaimCelebration = { id: number; amountYocto: bigint };

// ─── Helpers ─────────────────────────────────────────────────

function normalizeStakeAmountInput(raw: string): string {
  let value = raw
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/[^\d.]/g, '');
  if (!value) return '';

  const firstDotIndex = value.indexOf('.');
  if (firstDotIndex >= 0) {
    value =
      value.slice(0, firstDotIndex + 1) +
      value.slice(firstDotIndex + 1).replace(/\./g, '');
  }

  if (value.startsWith('.')) {
    value = `0${value}`;
  }

  if (!value.includes('.') && /^0\d+$/.test(value)) {
    value = `0.${value.slice(1)}`;
  }

  const hasTrailingDot = value.endsWith('.');
  const [rawWhole = '0', rawFraction = ''] = value.split('.');
  let whole = rawWhole.replace(/^0+(?=\d)/, '');
  if (!whole) whole = '0';

  const fraction = rawFraction.slice(0, STAKE_AMOUNT_MAX_DECIMALS);
  if (hasTrailingDot && fraction.length === 0) {
    return `${whole}.`;
  }

  return fraction ? `${whole}.${fraction}` : whole;
}

function finalizeStakeAmountInput(raw: string): string {
  const normalized = normalizeStakeAmountInput(raw);
  if (!normalized) return '';
  if (normalized.endsWith('.')) return normalized.slice(0, -1);

  if (!normalized.includes('.')) {
    return normalized;
  }

  const [whole, fraction] = normalized.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

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

function LiveClaimableAmount({
  valueYocto,
  fractionDigits,
  isLiveAccruing,
  className,
}: {
  valueYocto: bigint;
  fractionDigits: number;
  isLiveAccruing: boolean;
  className?: string;
}) {
  const { whole, fraction, full } = formatYoctoSocialParts(
    valueYocto,
    fractionDigits
  );

  return (
    <p
      className={cn(className, 'flex w-full justify-center')}
      aria-label={`${full} SOCIAL ready to collect`}
    >
      {isLiveAccruing && fractionDigits > 0 ? (
        <span
          className="inline-grid items-baseline tabular-nums"
          style={{
            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            width: '100%',
          }}
        >
          <span className="min-w-0 justify-self-end text-right">{whole}</span>
          <span className="justify-self-center opacity-90">.</span>
          <span className="min-w-0 justify-self-start text-left opacity-90">
            {fraction}
          </span>
        </span>
      ) : (
        <span>{full}</span>
      )}
    </p>
  );
}

function formatDecimalString(value: string, maxDec = 4): string {
  const normalized = finalizeStakeAmountInput(value);
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

function BoostCollectSection({
  visibleLiveClaimableYocto,
  displayFractionDigits,
  isLiveAccruing,
  perSecondDisplay,
  claimCelebration,
  claimCelebrationDurationSeconds,
  reduceMotion,
  txPending,
  pendingAction,
  onClaim,
  rewardsClaimed,
  hint,
  className,
}: {
  visibleLiveClaimableYocto: bigint;
  displayFractionDigits: number;
  isLiveAccruing: boolean;
  perSecondDisplay: string;
  claimCelebration: ClaimCelebration | null;
  claimCelebrationDurationSeconds: number;
  reduceMotion: boolean | null;
  txPending: boolean;
  pendingAction: BoostAction | null;
  onClaim: () => void;
  rewardsClaimed: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center overflow-hidden rounded-2xl px-4 py-3 text-center',
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
                scale: 0.9,
                y: -10,
                filter: 'blur(5px)',
              }
            : claimCelebration
              ? { opacity: 0, scale: 0.96 }
              : {
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  filter: 'blur(0px)',
                }
        }
        transition={{
          duration: claimCelebration ? 0.32 : 0.36,
          ease: claimCelebration ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1],
        }}
        className="flex flex-col items-center"
      >
        <span className="portal-eyebrow text-muted-foreground">
          Ready to Collect
        </span>
        <LiveClaimableAmount
          valueYocto={visibleLiveClaimableYocto}
          fractionDigits={displayFractionDigits}
          isLiveAccruing={isLiveAccruing}
          className="portal-green-text mt-1 font-mono text-3xl font-bold tabular-nums tracking-[-0.03em] md:text-4xl"
        />
        <span className="portal-green-text mt-0.5 portal-eyebrow-wide opacity-70">
          $SOCIAL
        </span>
        {isLiveAccruing && (
          <p className="mt-1 font-mono portal-type-label text-muted-foreground">
            +{perSecondDisplay}/sec
          </p>
        )}
        <Button
          onClick={onClaim}
          disabled={
            txPending || visibleLiveClaimableYocto < BOOST_CLAIM_DUST_YOCTO
          }
          variant="accent"
          size="sm"
          className="mt-3 min-w-[8rem] justify-center"
          loading={txPending && pendingAction === 'claim'}
        >
          <Gift className="h-3.5 w-3.5" />
          Collect
        </Button>
        {rewardsClaimed !== '0' && (
          <p className="mt-2 portal-type-label text-muted-foreground">
            Collected{' '}
            <span className="portal-green-text font-mono font-semibold tracking-tight">
              {formatSocial(rewardsClaimed)}
            </span>
          </p>
        )}
        {hint ? (
          <p className="mt-2 max-w-xs portal-type-label leading-relaxed text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}

function BoostMechanicCard({
  icon: Icon,
  title,
  description,
  accentClass,
  className,
}: {
  icon: typeof Zap;
  title: string;
  description: React.ReactNode;
  accentClass: string;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-3 py-4 md:gap-4 md:py-5', className)}>
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-muted/20">
        <Icon className={cn('h-4 w-4', accentClass)} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function BoostPage() {
  const { wallet, accountId, isConnected, connect, getSigningWallet } =
    useWallet();
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
  const [loadedRewardRate, setLoadedRewardRate] =
    useState<BoostRewardRate | null>(null);
  const [loadedTokenBalance, setLoadedTokenBalance] = useState('0');
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Live reward counter ──
  const [liveClaimableYocto, setLiveClaimableYocto] = useState(0n);
  const liveClaimableYoctoRef = useRef(0n);
  const liveCounterPausedRef = useRef(false);
  const lastConfirmedActionRef = useRef<BoostAction | null>(null);
  const hasLoadedAccountData =
    accountId !== null && loadedAccountIdRef.current === accountId;
  const account = hasLoadedAccountData ? loadedAccount : null;
  const lockStatus = hasLoadedAccountData ? loadedLockStatus : null;
  const rewardRate = hasLoadedAccountData ? loadedRewardRate : null;
  const tokenBalance = hasLoadedAccountData ? loadedTokenBalance : '0';
  const visibleLiveClaimableYocto = hasLoadedAccountData
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

  // ── Computed ──
  const period = LOCK_PERIODS[selectedPeriod];
  const normalizedStakeAmount = finalizeStakeAmountInput(stakeAmount);
  const stakeAmountYocto = BigInt(socialToYocto(normalizedStakeAmount || '0'));
  const enteredStakeAmount = stakeAmountYocto > 0n;
  const minimumStakeYocto = BigInt(socialToYocto(MIN_STAKE_AMOUNT));
  const effectiveStakeYocto = applyLockBonus(stakeAmountYocto, period.bonus);
  const hasStake = account && BigInt(account.locked_amount) > 0n;
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
  const showPositionPanel = true;
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
    (isConnected &&
      (isStakeInputMissing ||
        isBelowMinimumStake ||
        hasInsufficientBalance ||
        !canAddStake));
  const stakeButtonLabel = !isConnected
    ? 'Connect Wallet to Boost'
    : hasZeroBalance
      ? 'No SOCIAL Available'
      : isStakeInputMissing
        ? 'Enter Amount'
        : hasStake && !canAddStake
          ? 'Commitment Needs Migration'
          : hasStake
            ? 'Increase'
            : `Commit for ${period.label}`;
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
    clearClaimCelebration();
    clearTxResult();
    setDataLoading(false);
  }, [accountId, clearClaimCelebration, clearTxResult]);

  // ── Data Fetching ──

  // Always fetch stats (public data)
  useEffect(() => {
    os.boost
      .getStats()
      .then((s) => s && setStats(s))
      .catch(() => {});
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

  // Fetch user data when connected
  useEffect(() => {
    if (!accountId) {
      setLoadedAccount(null);
      setLoadedLockStatus(null);
      setLoadedRewardRate(null);
      setLoadedTokenBalance('0');
      setLiveClaimableYoctoValue(0n);
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
      setLoadedRewardRate(null);
      setLoadedTokenBalance('0');
      setStakeAmount('');
      setSelectedPeriod(2);
      setShowExtend(false);
      setShowRenew(false);
      clearClaimCelebration();
      setLiveClaimableYoctoValue(0n);
      liveCounterPausedRef.current = false;
      lastConfirmedActionRef.current = null;
      setDataLoading(true);
    }

    Promise.all([
      os.boost.getAccount(requestedAccountId),
      os.boost.getRewardRate(requestedAccountId),
      os.boost.getLockStatus(requestedAccountId),
      os.token.balanceOf(requestedAccountId),
    ])
      .then(([acct, rate, status, bal]) => {
        if (cancelled) return;

        loadedAccountIdRef.current = requestedAccountId;
        setLoadedAccount(acct);
        const chainClaimableYocto = parseYocto(rate?.claimable_now);
        const perSecondYocto = parseYocto(rate?.rewards_per_second);
        setLoadedRewardRate(
          rate
            ? {
                ...rate,
                claimable_now: normalizeBoostClaimableYocto(
                  chainClaimableYocto,
                  perSecondYocto
                ).toString(),
              }
            : rate
        );
        setLoadedLockStatus(status);
        setLoadedTokenBalance(bal ?? '0');

        // Auto-select current lock period
        if (acct && BigInt(acct.locked_amount) > 0n) {
          const idx = periodIndex(acct.lock_months);
          if (idx >= 0) setSelectedPeriod(idx);
        }
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
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

  // Re-anchor live counter to chain while connected.
  useEffect(() => {
    if (!accountId) return;

    const interval = setInterval(() => {
      setRefreshKey((key) => key + 1);
    }, BOOST_CHAIN_RESYNC_MS);

    return () => clearInterval(interval);
  }, [accountId]);

  useEffect(() => {
    if (!rewardRate) {
      setLiveClaimableYoctoValue(0n);
      return;
    }

    const initial = normalizeBoostClaimableYocto(
      parseYocto(rewardRate.claimable_now),
      parseYocto(rewardRate.rewards_per_second)
    );
    const perSecondYocto = parseYocto(rewardRate.rewards_per_second);
    const allowResetDown =
      lastConfirmedActionRef.current === 'claim' ||
      lastConfirmedActionRef.current === 'unlock';
    lastConfirmedActionRef.current = null;
    liveCounterPausedRef.current = false;
    const startValue =
      allowResetDown || perSecondYocto <= 0n
        ? initial
        : initial > liveClaimableYoctoRef.current
          ? initial
          : liveClaimableYoctoRef.current;

    if (perSecondYocto <= 0n) {
      setLiveClaimableYoctoValue(startValue);
      return;
    }

    const start = Date.now();
    setLiveClaimableYoctoValue(startValue);

    const interval = setInterval(() => {
      if (liveCounterPausedRef.current) return;

      const elapsedMs = BigInt(Date.now() - start);
      setLiveClaimableYoctoValue(
        startValue + (perSecondYocto * elapsedMs) / 1000n
      );
    }, LIVE_COUNTER_TICK_MS);

    return () => clearInterval(interval);
  }, [rewardRate, setLiveClaimableYoctoValue]);

  // ── Transaction Helpers ──

  const afterTx = useCallback(() => {
    // Immediate refresh
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
          if (action === 'claim') {
            const claimedYocto = liveClaimableYoctoRef.current;
            liveCounterPausedRef.current = true;
            triggerClaimCelebration(claimedYocto);
          }
          if (action === 'claim' || action === 'unlock') {
            setLiveClaimableYoctoValue(0n);
            setLoadedRewardRate((prev) =>
              prev ? { ...prev, claimable_now: '0' } : prev
            );
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
      setStakeAmount(normalizeStakeAmountInput(event.target.value));
    },
    []
  );

  const handleStakeAmountBlur = useCallback(() => {
    setStakeAmount((current) => finalizeStakeAmountInput(current));
  }, []);

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
        return result;
      }
    );
  };

  const handleClaim = () => {
    if (!wallet) return;
    runTx(
      'claim',
      {
        submitted: 'Collecting…',
        success: 'Balance collected!',
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
        success: 'Position released and rewards collected!',
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
  const perSecond = rewardRate
    ? parseFloat(yoctoToSocial(rewardRate.rewards_per_second))
    : 0;
  const perSecondYocto = rewardRate
    ? parseYocto(rewardRate.rewards_per_second)
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
      ? `${(stats.active_weekly_rate_bps / 100).toFixed(2)}% / week`
      : 'Loading';
  const positionItems = hasStake
    ? [
        {
          label: 'Share',
          value: userSharePct > 0 ? `${userSharePct.toFixed(2)}%` : '—',
        },
        {
          label: 'Release',
          value: activeWeeklyRateDisplay,
        },
        {
          label: 'Pace',
          value: `${dailyRewardEstimate.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} / day`,
        },
      ]
    : [];

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        ref={heroRef}
        badge="Boost"
        badgeAccent="blue"
        glowAccents={['blue', 'green']}
        glowClassName="h-40 opacity-70"
        contentClassName="max-w-3xl"
        title={
          <>
            Power Your Presence with{' '}
            <span className="portal-green-text">$</span>SOCIAL
          </>
        }
        description="Lock SOCIAL to grow your influence. Let the social games begin."
      />

      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />

      {/* ── Position Card ── */}
      <AnimatePresence initial={false}>
        {showPositionPanel ? (
          <motion.div
            key="position-panel-shell"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'mb-6',
              dataLoading && 'min-h-[19rem] md:min-h-[17rem]'
            )}
          >
            <AnimatePresence initial={false} mode="wait">
              {dataLoading ? (
                <motion.div
                  key="position-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="h-full min-h-[19rem] md:min-h-[17rem]"
                >
                  <SurfacePanel
                    radius="xl"
                    tone="soft"
                    className="flex h-full min-h-[19rem] items-center justify-center p-8 md:min-h-[17rem]"
                  >
                    <PulsingDots size="lg" />
                  </SurfacePanel>
                </motion.div>
              ) : hasStake ? (
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
                    className="h-full p-4 md:p-5"
                  >
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Commitment
                      </h2>
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

                    <BoostCollectSection
                      className="mt-4"
                      visibleLiveClaimableYocto={visibleLiveClaimableYocto}
                      displayFractionDigits={LIVE_COUNTER_DISPLAY_FRACTION_DIGITS}
                      isLiveAccruing={shouldLiveAccrueRewards}
                      perSecondDisplay={perSecondDisplay}
                      claimCelebration={claimCelebration}
                      claimCelebrationDurationSeconds={
                        claimCelebrationDurationSeconds
                      }
                      reduceMotion={reduceMotion}
                      txPending={txPending}
                      pendingAction={pendingAction}
                      onClaim={handleClaim}
                      rewardsClaimed={account.rewards_claimed}
                    />

                    {/* ── Stats ── */}
                    <StatStrip groupClassName="mt-2">
                      <StatStripCell label="Locked" showDivider>
                        <p className="text-portal-neutral font-mono text-sm font-semibold tracking-tight md:text-base">
                          {formatSocial(account.locked_amount)}
                        </p>
                      </StatStripCell>
                      <StatStripCell label="Influence" showDivider>
                        <p className="portal-green-text font-mono text-sm font-bold tracking-tight md:text-base">
                          {formatSocial(account.effective_boost)}
                        </p>
                      </StatStripCell>
                      <StatStripCell label="Period">
                        <p className="text-portal-neutral text-sm font-semibold md:text-base">
                          {LOCK_PERIODS.find(
                            (period) => period.months === account.lock_months
                          )?.short ?? `${account.lock_months}mo`}
                        </p>
                      </StatStripCell>
                    </StatStrip>

                    {positionItems.length > 0 && (
                      <StatStrip groupClassName="border-t-0">
                        {positionItems.map((item, index) => (
                          <StatStripCell
                            key={item.label}
                            label={item.label}
                            showDivider={index < positionItems.length - 1}
                          >
                            <p
                              className={cn(
                                'text-sm font-semibold tracking-tight',
                                item.label === 'Release'
                                  ? 'portal-gold-text'
                                  : 'portal-purple-text'
                              )}
                            >
                              {item.value}
                            </p>
                          </StatStripCell>
                        ))}
                      </StatStrip>
                    )}

                    {isSoleReleaseContributor && (
                      <p className="mt-2 text-center portal-type-label text-muted-foreground">
                        You are the only contributor — receiving 100% of pool
                        release.
                      </p>
                    )}

                    {/* ── Actions ── */}
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {canUnlock ? (
                        <Button
                          onClick={handleUnlock}
                          disabled={txPending}
                          size="sm"
                          className="gap-1.5"
                          loading={txPending && pendingAction === 'unlock'}
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Release + Collect
                        </Button>
                      ) : (
                        <>
                          <Button
                            onClick={() => setShowRenew(!showRenew)}
                            disabled={txPending}
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Renew
                          </Button>
                          {extendOptions.length > 0 && (
                            <Button
                              onClick={() => setShowExtend(!showExtend)}
                              disabled={txPending}
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              Extend
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {showRenew && (
                        <motion.div
                          key="renew-panel"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 border-t border-fade-detail pt-3 text-center">
                            <p className="mb-3 text-xs text-muted-foreground">
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
                          <div className="mt-3 border-t border-fade-detail pt-3 text-center">
                            <p className="mb-3 text-xs text-muted-foreground">
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
              ) : (
                <motion.div
                  key="position-empty"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                  className="h-full"
                >
                  <BoostSocialLayer
                    isConnected={isConnected}
                    hasStake={!!hasStake}
                    userSharePct={userSharePct}
                    isSoleReleaseContributor={isSoleReleaseContributor}
                    commitmentMonths={hasStake ? account.lock_months : null}
                    influenceScoreDisplay={
                      hasStake ? formatSocial(account.effective_boost) : '0'
                    }
                    lockedAmountDisplay={
                      hasStake ? formatSocial(account.locked_amount) : '0'
                    }
                    dailyEstimateDisplay={dailyRewardEstimate.toLocaleString(
                      'en-US',
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                    weeklyReleaseDisplay={publicWeeklyReleaseDisplay}
                    scheduledPoolDisplay={
                      stats ? formatSocial(stats.scheduled_pool) : '0'
                    }
                    totalLockedDisplay={
                      stats ? formatSocial(stats.total_locked) : '0'
                    }
                    activeWeeklyRateBps={stats?.active_weekly_rate_bps ?? null}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Stake Form ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="p-4 md:p-6"
        >
          {/* ── Period Selector ── */}
          <div>
            <h2 className="mb-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lock Period
            </h2>
            <div className="mx-auto grid max-w-md grid-cols-5 gap-1.5 sm:max-w-none sm:gap-2 xl:gap-3">
              {LOCK_PERIODS.map((lp, index) => {
                const disabled = !!(
                  hasStake &&
                  (currentPeriodIdx < 0 || index !== currentPeriodIdx)
                );
                return (
                  <button
                    type="button"
                    key={lp.months}
                    onClick={() => !disabled && setSelectedPeriod(index)}
                    disabled={disabled}
                    className={cn(
                      'relative rounded-xl border px-1.5 py-2.5 text-center transition-all sm:px-3 sm:py-3',
                      disabled
                        ? 'cursor-not-allowed border-border/30 bg-muted/20 opacity-30'
                        : selectedPeriod === index
                          ? 'portal-blue-surface shadow-sm'
                          : 'border-border/50 bg-background/40 hover:border-border hover:bg-background/55'
                    )}
                  >
                    {hasStake && !lockExpired && index === currentPeriodIdx && (
                      <PortalBadge
                        accent="neutral"
                        size="sm"
                        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 portal-type-micro sm:px-2"
                      >
                        Current
                      </PortalBadge>
                    )}
                    <div>
                      <div className="mb-0.5 text-xs font-semibold sm:mb-1 sm:text-sm">
                        {lp.short}
                      </div>
                      <div
                        className="text-sm font-bold sm:text-lg"
                        style={{ color: disabled ? undefined : lp.color }}
                      >
                        +{lp.bonus}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {hasStake && currentPeriodIdx < 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Your commitment ({account.lock_months}mo) isn't a preset period.
                Use <strong>Extend</strong> or unlock when eligible.
              </p>
            )}
          </div>

          {/* ── Amount Input ── */}
          <div className="mt-5 border-t border-fade-section pt-5">
            <div className="mb-3 flex items-center justify-between">
              <label
                htmlFor="stake-amount"
                className="text-sm text-muted-foreground"
              >
                Amount
              </label>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {isConnected && (
                  <>
                    <span className="font-mono">{balanceDisplay}</span>
                    {balanceYocto > 0n && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          setStakeAmount(
                            finalizeStakeAmountInput(
                              yoctoToSocial(tokenBalance)
                            )
                          )
                        }
                      >
                        Max
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <SurfacePanel
              radius="md"
              tone="inset"
              borderTone="subtle"
              padding="none"
              className="portal-blue-focus flex items-center gap-3 px-4 py-3"
            >
              <input
                id="stake-amount"
                type="text"
                inputMode="decimal"
                value={stakeAmount}
                onChange={handleStakeAmountChange}
                onBlur={handleStakeAmountBlur}
                placeholder="0"
                autoComplete="off"
                spellCheck={false}
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/50 md:text-3xl"
              />
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {tokenIconSrc ? (
                  <img
                    src={tokenIconSrc}
                    alt="SOCIAL"
                    className="h-5 w-5 rounded-full object-cover"
                    onError={() => setTokenIconSrc(null)}
                  />
                ) : null}
                SOCIAL
              </span>
            </SurfacePanel>
            <div className="mt-2 min-h-5">
              <AnimatePresence initial={false} mode="wait">
                {isBelowMinimumStake ? (
                  <motion.div
                    key="stake-warning-minimum"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="flex items-start gap-2 text-xs text-amber-500/90"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>Minimum stake is 0.01 SOCIAL.</span>
                  </motion.div>
                ) : hasInsufficientBalance ? (
                  <motion.div
                    key="stake-warning-balance"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="flex items-start gap-2 text-xs text-amber-500/90"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>Insufficient SOCIAL balance.</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Preview ── */}
          <AnimatePresence initial={false}>
            {enteredStakeAmount ? (
              <motion.div
                key="stake-preview"
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <div className="border-t border-fade-detail pt-4">
                  <div className="space-y-2.5 text-sm">
                    {hasStake ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Current</span>
                          <span className="font-mono font-semibold">
                            {formatSocial(account.locked_amount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Adding</span>
                          <span className="font-semibold">
                            +{formatSocial(stakeAmountYocto)}
                          </span>
                        </div>
                        <div className="h-px divider-detail" />
                      </>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {hasStake ? 'New Locked' : 'Locked'}
                      </span>
                      <span className="font-mono font-semibold text-foreground/85">
                        {hasStake
                          ? formatSocial(newTotalLockedYocto)
                          : formatSocial(stakeAmountYocto)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Bonus ({period.short})
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: period.color }}
                      >
                        +{period.bonus}%
                      </span>
                    </div>
                    <div className="h-px divider-detail" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        Influence
                      </span>
                      <span className="portal-green-text font-mono text-lg font-bold tracking-[-0.02em] md:text-xl">
                        {hasStake
                          ? formatSocial(newEffectiveStakeYocto, 2)
                          : formatSocial(effectiveStakeYocto, 2)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Unlocks{' '}
                    {(() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + period.months);
                      return d.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                    })()}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* ── CTA ── */}
          <Button
            type="button"
            onClick={handleStake}
            disabled={isStakeActionDisabled}
            loading={txPending && pendingAction === 'stake'}
            loadingIndicatorSize="md"
            size="cta"
            className="mt-4 w-full"
          >
            <Lock className="h-5 w-5" />
            {stakeButtonLabel}
          </Button>

          <p className="mt-3 text-center portal-type-label leading-relaxed text-muted-foreground">
            {hasStake
              ? 'Adding resets your commitment period. Rewards stay collectable and settle when you release.'
              : 'Your SOCIAL stays committed for the full period. Rewards are collectable during commitment and settle when you release.'}
          </p>
        </SurfacePanel>
      </motion.div>

      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="mt-6"
        >
          <SurfacePanel
            radius="xl"
            tone="subtle"
            padding="none"
            className="p-4 md:p-5"
          >
            <h2 className="mb-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Network
            </h2>
            <StatStrip>
              <StatStripCell
                label="Total Locked"
                value={formatSocial(stats.total_locked)}
                showDivider
              />
              <StatStripCell
                label="Pool"
                value={formatSocial(stats.scheduled_pool)}
                valueClassName="portal-blue-text"
                showDivider
              />
              <StatStripCell
                label="Distributed"
                value={formatSocial(stats.total_rewards_released)}
              />
            </StatStrip>
          </SurfacePanel>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.19 }}
        className="mt-6"
      >
        <SurfacePanel
          radius="xl"
          tone="subtle"
          padding="none"
          className="p-4 md:p-5"
        >
          <h2 className="mb-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            How It Works
          </h2>
          <div className="divide-y divide-fade-detail border-t border-fade-detail">
            <BoostMechanicCard
              icon={Zap}
              title="Progressive Distribution"
              accentClass="portal-green-icon"
              description="Rewards follow your influence score. The pool releases at the current weekly rate."
            />
            <BoostMechanicCard
              icon={TrendingUp}
              title="Activity-Powered Pool"
              accentClass="portal-purple-icon"
              description="Network activity strengthens the system for everyone involved."
            />
            <BoostMechanicCard
              icon={Shield}
              title="On-Chain & Transparent"
              accentClass="portal-blue-icon"
              description={
                <>
                  Participation is open and visible on{' '}
                  <a
                    href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${BOOST_CONTRACT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono portal-link"
                  >
                    {BOOST_CONTRACT}
                  </a>
                  .
                </>
              }
            />
          </div>
        </SurfacePanel>
      </motion.div>
    </PageShell>
  );
}
