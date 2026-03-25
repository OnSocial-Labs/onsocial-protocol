'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ArrowRight,
  Info,
  Lock,
  Shield,
  Zap,
  TrendingUp,
  Gift,
  RefreshCw,
  ArrowUpRight,
  Unlock,
  Check,
  X,
  ChevronDown,
  Timer,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  viewContractAt,
  yoctoToSocial,
  socialToYocto,
  STAKING_CONTRACT,
  TOKEN_CONTRACT,
  type StakingAccountView,
  type StakingLockStatus,
  type StakingStats,
  type StakingRewardRate,
} from '@/lib/near-rpc';
import { portalColors } from '@/lib/portal-colors';
import { cn } from '@/lib/utils';

// ─── Lock Periods (matches VALID_LOCK_PERIODS in contract) ──
const LOCK_PERIODS = [
  {
    months: 1,
    bonus: 5,
    label: '1 Month',
    short: '1mo',
    color: portalColors.slate,
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
    color: portalColors.amber,
  },
];

interface TokenMetadataView {
  icon?: string | null;
  symbol: string;
}

const STAKE_AMOUNT_MAX_DECIMALS = 18;
const MIN_STAKE_AMOUNT = '0.01';

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

function addThousandsSeparators(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

// ─── Page ────────────────────────────────────────────────────

export default function StakingPage() {
  const { wallet, accountId, isConnected, connect } = useWallet();
  const heroRef = useRef(null);
  const loadedAccountIdRef = useRef<string | null>(null);
  const isInView = useInView(heroRef, { once: true, amount: 0.1 });

  // ── Calculator state ──
  const [selectedPeriod, setSelectedPeriod] = useState(2); // default 12mo
  const [stakeAmount, setStakeAmount] = useState('');

  // ── On-chain data ──
  const [account, setAccount] = useState<StakingAccountView | null>(null);
  const [lockStatus, setLockStatus] = useState<StakingLockStatus | null>(null);
  const [stats, setStats] = useState<StakingStats | null>(null);
  const [rewardRate, setRewardRate] = useState<StakingRewardRate | null>(null);
  const [tokenBalance, setTokenBalance] = useState('0');
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Live reward counter ──
  const [liveClaimable, setLiveClaimable] = useState(0);

  // ── Transaction state ──
  const [txPending, setTxPending] = useState(false);
  const [txResult, setTxResult] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // ── Extend lock UI ──
  const [showExtend, setShowExtend] = useState(false);
  const [showMechanics, setShowMechanics] = useState(false);

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
  const showPositionPanel = isConnected && (dataLoading || hasStake);
  const balanceYocto = BigInt(tokenBalance);
  const balanceDisplay = formatSocial(balanceYocto);
  const hasInsufficientBalance =
    enteredStakeAmount && stakeAmountYocto > balanceYocto;
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
    ? 'Connect Wallet to Stake'
    : hasZeroBalance
      ? 'No SOCIAL Available to Stake'
      : isStakeInputMissing
        ? 'Enter Amount to Stake'
        : hasStake && !canAddStake
          ? 'Cannot Add Until Lock Period Is Migrated'
          : hasStake
            ? `Add & Re-lock for ${period.label}`
            : `Lock for ${period.label}`;

  useLayoutEffect(() => {
    if (accountId) return;

    setStakeAmount('');
    setSelectedPeriod(2);
    setShowExtend(false);
    setShowMechanics(false);
    setTxResult(null);
    setDataLoading(false);
  }, [accountId]);

  // ── Data Fetching ──

  // Always fetch stats (public data)
  useEffect(() => {
    viewContractAt<StakingStats>(STAKING_CONTRACT, 'get_stats', {})
      .then((s) => s && setStats(s))
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    viewContractAt<TokenMetadataView>(TOKEN_CONTRACT, 'ft_metadata', {})
      .then((metadata) => {
        if (metadata?.icon) {
          setTokenIconSrc(metadata.icon);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch user data when connected
  useEffect(() => {
    if (!accountId) {
      setAccount(null);
      setLockStatus(null);
      setRewardRate(null);
      setTokenBalance('0');
      loadedAccountIdRef.current = null;
      return;
    }

    const isInitialLoadForAccount = loadedAccountIdRef.current !== accountId;
    if (isInitialLoadForAccount) {
      setDataLoading(true);
    }

    Promise.all([
      viewContractAt<StakingAccountView>(STAKING_CONTRACT, 'get_account', {
        account_id: accountId,
      }),
      viewContractAt<StakingRewardRate>(STAKING_CONTRACT, 'get_reward_rate', {
        account_id: accountId,
      }),
      viewContractAt<StakingLockStatus>(STAKING_CONTRACT, 'get_lock_status', {
        account_id: accountId,
      }),
      viewContractAt<string>(TOKEN_CONTRACT, 'ft_balance_of', {
        account_id: accountId,
      }),
    ])
      .then(([acct, rate, status, bal]) => {
        loadedAccountIdRef.current = accountId;
        setAccount(acct);
        setRewardRate(rate);
        setLockStatus(status);
        setTokenBalance(bal ?? '0');

        // Auto-select current lock period
        if (acct && BigInt(acct.locked_amount) > 0n) {
          const idx = periodIndex(acct.lock_months);
          if (idx >= 0) setSelectedPeriod(idx);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (isInitialLoadForAccount) {
          setDataLoading(false);
        }
      });
  }, [accountId, refreshKey]);

  // ── Live reward counter ──
  useEffect(() => {
    if (!rewardRate) {
      setLiveClaimable(0);
      return;
    }

    const initial = parseFloat(yoctoToSocial(rewardRate.claimable_now));
    const perSec = parseFloat(yoctoToSocial(rewardRate.rewards_per_second));

    if (perSec <= 0) {
      setLiveClaimable(initial);
      return;
    }

    const start = Date.now();
    setLiveClaimable(initial);

    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setLiveClaimable(initial + perSec * elapsed);
    }, 100);

    return () => clearInterval(interval);
  }, [rewardRate]);

  // Auto-dismiss transient feedback
  useEffect(() => {
    if (txResult) {
      const timeout = txResult.type === 'success' ? 5000 : 7000;
      const timer = setTimeout(() => setTxResult(null), timeout);
      return () => clearTimeout(timer);
    }
  }, [txResult]);

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
    async (label: string, fn: () => Promise<void>) => {
      setTxPending(true);
      setTxResult(null);
      try {
        await fn();
        setTxResult({ type: 'success', msg: label });
        afterTx();
      } catch (e) {
        setTxResult({
          type: 'error',
          msg: e instanceof Error ? e.message : 'Transaction failed',
        });
      } finally {
        setTxPending(false);
      }
    },
    [afterTx]
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
      `Locked ${normalizedStakeAmount} SOCIAL for ${period.label}`,
      async () => {
        await wallet.signAndSendTransaction({
          receiverId: TOKEN_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'ft_transfer_call',
                args: {
                  receiver_id: STAKING_CONTRACT,
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
      }
    );
  };

  const handleClaim = () => {
    if (!wallet) return;
    runTx('Rewards claimed!', async () => {
      await wallet.signAndSendTransaction({
        receiverId: STAKING_CONTRACT,
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
      });
    });
  };

  const handleUnlock = () => {
    if (!wallet) return;
    runTx('Tokens unlocked and returned!', async () => {
      await wallet.signAndSendTransaction({
        receiverId: STAKING_CONTRACT,
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
      });
    });
  };

  const handleExtend = (months: number) => {
    if (!wallet) return;
    const lp = LOCK_PERIODS.find((p) => p.months === months);
    runTx(`Lock extended to ${lp?.label ?? months + ' months'}`, async () => {
      await wallet.signAndSendTransaction({
        receiverId: STAKING_CONTRACT,
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
    });
  };

  const handleRenew = () => {
    if (!wallet) return;
    runTx('Lock renewed!', async () => {
      await wallet.signAndSendTransaction({
        receiverId: STAKING_CONTRACT,
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
    });
  };

  // ── Extend options (periods longer than current) ──
  const extendOptions = hasStake
    ? LOCK_PERIODS.filter((lp) => lp.months > account.lock_months)
    : [];

  // ── User share ──
  const userSharePct =
    account && stats && BigInt(stats.total_effective_stake) > 0n
      ? Number(
          (BigInt(account.effective_stake) * 10000n) /
            BigInt(stats.total_effective_stake)
        ) / 100
      : 0;

  // ── Reward rate per second ──
  const perSecond = rewardRate
    ? parseFloat(yoctoToSocial(rewardRate.rewards_per_second))
    : 0;

  return (
    <PageShell className="max-w-5xl">
      {/* ── Hero ── */}
      <motion.div
        ref={heroRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-8 px-2 py-4 text-center md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(96,165,250,0.18), transparent 45%), radial-gradient(circle at 75% 25%, rgba(74,222,128,0.12), transparent 38%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
            Grow your <span className="portal-green-text">$</span>SOCIAL
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Longer locks unlock higher rewards.
          </p>
        </div>
      </motion.div>

      {/* ── Transaction Feedback ── */}
      <AnimatePresence initial={false}>
        {txResult && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-x-6 top-20 z-50 mx-auto w-auto max-w-md md:inset-x-4 md:w-full md:max-w-xl"
          >
            <div
              className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                txResult.type === 'success'
                  ? 'portal-green-toast'
                  : 'portal-red-toast'
              }`}
            >
              {txResult.type === 'success' ? (
                <Check className="portal-green-icon h-5 w-5 flex-shrink-0" />
              ) : (
                <X className="portal-red-icon h-5 w-5 flex-shrink-0" />
              )}
              <span className="flex-1 text-sm font-medium">{txResult.msg}</span>
              <button
                onClick={() => setTxResult(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Position Card ── */}
      {showPositionPanel && (
        <div className="mb-6 min-h-[19rem] md:min-h-[17rem]">
          <AnimatePresence initial={false} mode="wait">
            {dataLoading ? (
              <motion.div
                key="position-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex h-full min-h-[19rem] items-center justify-center rounded-[1.5rem] border border-border/50 bg-background/40 p-8 md:min-h-[17rem]"
              >
                <PulsingDots size="lg" />
              </motion.div>
            ) : hasStake ? (
              <motion.div
                key="position-content"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
                className="h-full rounded-[1.5rem] border border-border/50 bg-background/40 p-4 md:p-5"
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Your Position
                  </h2>
                  {canUnlock ? (
                    <span className="portal-amber-badge rounded-full border px-3 py-1 text-xs font-medium">
                      Lock Expired
                    </span>
                  ) : (
                    <span className="portal-slate-surface inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-all">
                      <Timer className="h-3 w-3" />
                      {formatTimeRemaining(account.unlock_at)}
                    </span>
                  )}
                </div>

                <div className="relative rounded-[1.25rem] bg-background/50 px-4 py-4 md:px-5">
                  <div className="pr-24 md:pr-28">
                    <div className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Gift className="h-3 w-3" /> Claimable Rewards
                      </span>
                      <div className="mt-1">
                        <p className="portal-green-text truncate font-mono text-2xl font-bold tracking-[-0.03em] md:text-3xl">
                          {liveClaimable.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          })}{' '}
                          <span className="portal-green-text text-sm font-medium tracking-normal opacity-80 md:text-base">
                            $SOCIAL
                          </span>
                        </p>
                        {perSecond > 0 && (
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            +{perSecond.toFixed(8)}/sec
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleClaim}
                    disabled={txPending || liveClaimable <= 0}
                    variant="accent"
                    size="sm"
                    className="absolute right-4 top-4 min-w-[7.5rem] justify-center md:right-5"
                  >
                    {txPending ? <PulsingDots size="sm" /> : 'Claim'}
                  </Button>
                </div>

                <div className="mt-4 border-y border-border/40">
                  <div className="grid grid-cols-3 text-center">
                    <div className="relative px-2 py-3">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Locked
                      </span>
                      <p className="portal-slate-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base">
                        {formatSocial(account.locked_amount)}
                      </p>
                      <span className="absolute bottom-3 right-0 top-3 w-px bg-border/40" />
                    </div>
                    <div className="relative px-2 py-3">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Effective
                      </span>
                      <p className="portal-green-text mt-1 font-mono text-base font-bold tracking-tight md:text-lg">
                        {formatSocial(account.effective_stake)}
                      </p>
                      <span className="absolute bottom-3 right-0 top-3 w-px bg-border/40" />
                    </div>
                    <div className="px-2 py-3">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Lock
                      </span>
                      <p className="portal-slate-text mt-1 text-sm font-semibold md:text-base">
                        {account.lock_months}{' '}
                        {account.lock_months === 1 ? 'month' : 'months'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2 md:gap-4">
                  <span>
                    Pool share:{' '}
                    {userSharePct > 0 ? `${userSharePct.toFixed(2)}%` : '—'}
                  </span>
                  {account.rewards_claimed !== '0' && (
                    <span className="md:text-right">
                      Previously claimed:{' '}
                      {formatSocial(account.rewards_claimed)}
                    </span>
                  )}
                </div>

                <div className="mt-4 border-t border-border/40 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {canUnlock ? (
                      <Button
                        onClick={handleUnlock}
                        disabled={txPending}
                        className="gap-1.5"
                      >
                        <Unlock className="h-4 w-4" />
                        {txPending ? (
                          <PulsingDots size="sm" />
                        ) : (
                          'Unlock & Withdraw'
                        )}
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={handleRenew}
                          disabled={txPending}
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Renew Lock
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
                            Extend Lock
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${showExtend ? 'rotate-180' : ''}`}
                            />
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  <AnimatePresence>
                    {showExtend && extendOptions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 border-t border-border/40 pt-4">
                          <p className="mb-3 text-xs text-muted-foreground">
                            Extend to a longer period (resets lock timer):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {extendOptions.map((lp) => (
                              <Button
                                key={lp.months}
                                onClick={() => handleExtend(lp.months)}
                                disabled={txPending}
                                variant="outline"
                                size="sm"
                              >
                                {lp.label}{' '}
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
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      {/* ── Stake Form ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-[1.75rem] border border-border/50 bg-background/45 p-5 md:p-8"
      >
        <div>
          <h3 className="mb-4 text-base font-semibold md:text-lg">
            {hasStake ? 'Add to Your Stake' : 'Lock Period'}
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {LOCK_PERIODS.map((lp, index) => {
              const disabled = !!(
                hasStake &&
                (currentPeriodIdx < 0 || index !== currentPeriodIdx)
              );
              return (
                <button
                  key={lp.months}
                  onClick={() => !disabled && setSelectedPeriod(index)}
                  disabled={disabled}
                  className={`relative rounded-xl border px-3 py-3 text-center transition-all ${
                    disabled
                      ? 'cursor-not-allowed border-border/30 bg-muted/20 opacity-30'
                      : selectedPeriod === index
                        ? 'portal-blue-surface'
                        : 'border-border/50 bg-muted/30 hover:border-border'
                  }`}
                >
                  {hasStake && !lockExpired && index === currentPeriodIdx && (
                    <span className="portal-slate-surface absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[10px] font-medium text-foreground">
                      Current
                    </span>
                  )}
                  <div>
                    <div className="mb-1 text-sm font-semibold sm:hidden">
                      {lp.short}
                    </div>
                    <div className="mb-1 hidden text-sm font-semibold sm:block">
                      {lp.label}
                    </div>
                    <div
                      className="text-lg font-bold"
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
            <p className="mt-3 text-xs text-muted-foreground">
              Your active lock period ({account.lock_months}mo) is not in the
              preset list. Adding stake is blocked on-chain until your period is
              migrated to a supported value. Use <strong>Extend Lock</strong> if
              available, or unlock when eligible.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-border/50 pt-6">
          <div className="mb-4 flex items-center justify-between">
            <label
              htmlFor="stake-amount"
              className="text-sm text-muted-foreground"
            >
              Amount
            </label>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {isConnected && (
                <>
                  <span>
                    Balance: <span className="font-mono">{balanceDisplay}</span>
                  </span>
                  {balanceYocto > 0n && (
                    <button
                      className="portal-action-link"
                      onClick={() =>
                        setStakeAmount(
                          finalizeStakeAmountInput(yoctoToSocial(tokenBalance))
                        )
                      }
                    >
                      Max
                    </button>
                  )}
                </>
              )}
              <span>Min: 0.01</span>
            </div>
          </div>
          <div className="portal-blue-focus flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
            <input
              id="stake-amount"
              type="text"
              inputMode="decimal"
              value={stakeAmount}
              onChange={handleStakeAmountChange}
              onBlur={handleStakeAmountBlur}
              placeholder="0.00"
              autoComplete="off"
              spellCheck={false}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none min-w-0 flex-1 bg-transparent text-2xl font-bold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/50 md:text-3xl"
            />
            <span className="flex items-center gap-2 text-base text-muted-foreground/90">
              {tokenIconSrc && (
                <img
                  src={tokenIconSrc}
                  alt="SOCIAL"
                  className="h-5 w-5 rounded-full object-cover"
                  onError={() => setTokenIconSrc(null)}
                />
              )}
              SOCIAL
            </span>
          </div>
          <div className="mt-2 min-h-5">
            {isBelowMinimumStake ? (
              <div className="flex items-start gap-2 text-xs text-amber-500/90">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Minimum stake is 0.01 SOCIAL.</span>
              </div>
            ) : hasInsufficientBalance ? (
              <div className="flex items-start gap-2 text-xs text-amber-500/90">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Insufficient SOCIAL balance.</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 border-t border-border/50 pt-5">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {hasStake ? 'New Effective Stake' : 'Effective Stake'}
          </h3>
          <div className="space-y-3">
            {hasStake && enteredStakeAmount && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Current Locked
                  </span>
                  <span className="ml-2 truncate font-mono text-base font-semibold">
                    {formatSocial(account.locked_amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Adding</span>
                  <span className="ml-2 truncate text-base font-semibold">
                    +{formatSocial(stakeAmountYocto)}
                  </span>
                </div>
                <div className="h-px bg-border/50" />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {hasStake && enteredStakeAmount
                  ? 'New Total Locked'
                  : 'Locked Amount'}
              </span>
              <span className="ml-2 truncate text-base font-semibold text-foreground/85">
                {enteredStakeAmount
                  ? hasStake
                    ? formatSocial(newTotalLockedYocto)
                    : formatSocial(stakeAmountYocto)
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Lock Bonus ({period.label})
              </span>
              <span
                className="text-base font-semibold"
                style={{ color: period.color }}
              >
                +{period.bonus}%
              </span>
            </div>
            <div className="h-px bg-border/50" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">
                Effective Stake
              </span>
              <span className="ml-2 truncate text-xl font-bold tracking-[-0.02em] text-foreground md:text-2xl">
                {enteredStakeAmount
                  ? hasStake
                    ? formatSocial(newEffectiveStakeYocto, 2)
                    : formatSocial(effectiveStakeYocto, 2)
                  : '—'}
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Unlock:{' '}
              {(() => {
                const d = new Date();
                d.setMonth(d.getMonth() + period.months);
                return d.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                });
              })()}{' '}
              <span className="text-muted-foreground/60">
                (~{period.months * 30}d on-chain)
              </span>
            </span>
          </div>
        </div>

        <button
          onClick={handleStake}
          disabled={isStakeActionDisabled}
          className="portal-blue-surface group relative mt-5 flex w-full items-center justify-center gap-2 rounded-full border py-4 text-base font-semibold disabled:opacity-50"
        >
          <span
            className={cn(
              'flex items-center justify-center gap-2',
              txPending && 'invisible'
            )}
          >
            <Lock className="h-5 w-5" />
            {stakeButtonLabel}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </span>
          {txPending ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <PulsingDots size="md" />
            </span>
          ) : null}
        </button>

        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="portal-amber-icon mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div>
            {hasStake ? (
              <>
                Additional stake keeps the same period and restarts your{' '}
                {period.label} timer from today. Rewards stay claimable during
                the lock.
              </>
            ) : (
              <>
                Tokens stay locked for the full period. You can extend later,
                but not shorten it. Rewards stay claimable during the lock.
              </>
            )}
          </div>
        </div>
      </motion.div>

      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-8 py-2"
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Total Staked
              </span>
              <p className="mt-1 font-mono text-base font-bold text-foreground/80 md:text-lg">
                {formatSocial(stats.total_locked)}
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Reward Pool
              </span>
              <p className="mt-1 font-mono text-base font-bold text-foreground/80 md:text-lg">
                {formatSocial(stats.scheduled_pool)}
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Total Released
              </span>
              <p className="mt-1 font-mono text-base font-bold text-foreground/80 md:text-lg">
                {formatSocial(stats.total_rewards_released)}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-4"
      >
        <button
          onClick={() => setShowMechanics(!showMechanics)}
          className="flex w-full items-center justify-between border-y border-border/40 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-medium">How it works</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showMechanics ? 'rotate-180' : ''}`}
          />
        </button>
        <AnimatePresence>
          {showMechanics && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid gap-0 border-b border-border/40 md:grid-cols-3">
                <div className="relative border-b border-border/40 px-0 py-5 md:border-b-0 md:pr-6">
                  <Zap className="portal-green-icon mb-3 h-4 w-4" />
                  <h3 className="mb-1 text-sm font-semibold">Compound Decay</h3>
                  <p className="text-xs text-muted-foreground">
                    0.2% of the scheduled pool releases weekly. Your share =
                    your stake-seconds ÷ total. Rewards never run out abruptly.
                  </p>
                  <span className="absolute bottom-5 right-0 top-5 hidden w-px bg-border/40 md:block" />
                </div>
                <div className="relative border-b border-border/40 px-0 py-5 md:border-b-0 md:px-6">
                  <TrendingUp className="portal-purple-icon mb-3 h-4 w-4" />
                  <h3 className="mb-1 text-sm font-semibold">Growing Pool</h3>
                  <p className="text-xs text-muted-foreground">
                    40% of every API credit purchase flows into the reward pool
                    — more usage, more rewards.
                  </p>
                  <span className="absolute bottom-5 right-0 top-5 hidden w-px bg-border/40 md:block" />
                </div>
                <div className="px-0 py-5 md:pl-6">
                  <Shield className="portal-blue-icon mb-3 h-4 w-4" />
                  <h3 className="mb-1 text-sm font-semibold">
                    On-Chain & Trustless
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    All logic runs on{' '}
                    <span className="font-mono text-foreground/70">
                      {STAKING_CONTRACT}
                    </span>
                    . Auto-registered on first stake — no separate storage
                    deposit.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </PageShell>
  );
}
