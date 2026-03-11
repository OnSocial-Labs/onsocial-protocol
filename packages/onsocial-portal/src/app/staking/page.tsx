'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  CheckCircle2,
  XCircle,
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
  type StakingStats,
  type StakingRewardRate,
} from '@/lib/near-rpc';

// ─── Lock Periods (matches VALID_LOCK_PERIODS in contract) ──
const LOCK_PERIODS = [
  {
    months: 1,
    bonus: 5,
    label: '1 Month',
    short: '1mo',
    color: '#6B7280',
    tone: 'Flexible entry',
  },
  {
    months: 6,
    bonus: 10,
    label: '6 Months',
    short: '6mo',
    color: '#60A5FA',
    tone: 'Balanced lock',
  },
  {
    months: 12,
    bonus: 20,
    label: '12 Months',
    short: '12mo',
    color: '#4ADE80',
    tone: 'Best default',
    popular: true,
  },
  {
    months: 24,
    bonus: 35,
    label: '24 Months',
    short: '24mo',
    color: '#C084FC',
    tone: 'High conviction',
  },
  {
    months: 48,
    bonus: 50,
    label: '48 Months',
    short: '48mo',
    color: '#FBBF24',
    tone: 'Maximum weight',
  },
];

// ─── Helpers ─────────────────────────────────────────────────

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

function formatUnlockDate(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Display yocto-SOCIAL as a clean human number. */
function formatSocial(yocto: string, maxDec = 4): string {
  const raw = yoctoToSocial(yocto);
  const num = parseFloat(raw);
  if (num === 0) return '0';
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  if (num >= 1_000)
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return num.toLocaleString('en-US', { maximumFractionDigits: maxDec });
}

function periodIndex(months: number): number {
  return LOCK_PERIODS.findIndex((lp) => lp.months === months);
}

// ─── Page ────────────────────────────────────────────────────

export default function StakingPage() {
  const { wallet, accountId, isConnected, connect } = useWallet();
  const heroRef = useRef(null);
  const isInView = useInView(heroRef, { once: true, amount: 0.1 });

  // ── Calculator state ──
  const [selectedPeriod, setSelectedPeriod] = useState(2); // default 12mo
  const [stakeAmount, setStakeAmount] = useState('');

  // ── On-chain data ──
  const [account, setAccount] = useState<StakingAccountView | null>(null);
  const [stats, setStats] = useState<StakingStats | null>(null);
  const [rewardRate, setRewardRate] = useState<StakingRewardRate | null>(null);
  const [tokenBalance, setTokenBalance] = useState('0');
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

  // ── Computed ──
  const period = LOCK_PERIODS[selectedPeriod];
  const amount = parseFloat(stakeAmount) || 0;
  const effectiveStake = amount * (1 + period.bonus / 100);
  const hasStake = account && BigInt(account.locked_amount) > 0n;
  const lockExpired =
    hasStake &&
    account.unlock_at > 0 &&
    Date.now() * 1_000_000 >= account.unlock_at;
  const currentPeriodIdx = hasStake ? periodIndex(account.lock_months) : -1;
  const balanceNum = parseFloat(yoctoToSocial(tokenBalance));

  // ── Data Fetching ──

  // Always fetch stats (public data)
  useEffect(() => {
    viewContractAt<StakingStats>(STAKING_CONTRACT, 'get_stats', {})
      .then((s) => s && setStats(s))
      .catch(() => {});
  }, [refreshKey]);

  // Fetch user data when connected
  useEffect(() => {
    if (!accountId) {
      setAccount(null);
      setRewardRate(null);
      setTokenBalance('0');
      return;
    }

    setDataLoading(true);
    Promise.all([
      viewContractAt<StakingAccountView>(STAKING_CONTRACT, 'get_account', {
        account_id: accountId,
      }),
      viewContractAt<StakingRewardRate>(STAKING_CONTRACT, 'get_reward_rate', {
        account_id: accountId,
      }),
      viewContractAt<string>(TOKEN_CONTRACT, 'ft_balance_of', {
        account_id: accountId,
      }),
    ])
      .then(([acct, rate, bal]) => {
        setAccount(acct);
        setRewardRate(rate);
        setTokenBalance(bal ?? '0');

        // Auto-select current lock period
        if (acct && BigInt(acct.locked_amount) > 0n) {
          const idx = periodIndex(acct.lock_months);
          if (idx >= 0) setSelectedPeriod(idx);
        }
      })
      .catch(console.error)
      .finally(() => setDataLoading(false));
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

  // Auto-dismiss success messages
  useEffect(() => {
    if (txResult?.type === 'success') {
      const timer = setTimeout(() => setTxResult(null), 5000);
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

  const handleStake = () => {
    if (!wallet || !accountId) return connect();
    if (amount < 0.01) return;

    const yocto = socialToYocto(stakeAmount);
    if (BigInt(yocto) > BigInt(tokenBalance)) {
      setTxResult({ type: 'error', msg: 'Insufficient SOCIAL balance' });
      return;
    }

    runTx(`Locked ${stakeAmount} SOCIAL for ${period.label}`, async () => {
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
                msg: JSON.stringify({ action: 'lock', months: period.months }),
              },
              gas: '80000000000000',
              deposit: '1',
            },
          },
        ],
      });
      setStakeAmount('');
    });
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
    <PageShell>
        {/* ── Hero ── */}
        <motion.div
          ref={heroRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#60A5FA]">
            On-chain staking console
          </p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-[-0.03em]">
            Stake $SOCIAL
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Lock tokens, earn pro-rata rewards. Longer locks earn a higher
            effective stake.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Reward model',
                value: 'Pro-rata weekly release',
              },
              {
                label: 'Bonus range',
                value: '5% to 50% effective weight',
              },
              {
                label: 'Claiming',
                value: 'Rewards stay claimable during lock',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border/40 bg-background/30 px-4 py-3 text-left"
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-sm text-foreground/90">{item.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Transaction Feedback ── */}
        <AnimatePresence>
          {txResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-6 flex items-center gap-3 p-4 rounded-xl border ${
                txResult.type === 'success'
                  ? 'border-[#4ADE80]/30 bg-[#4ADE80]/[0.04]'
                  : 'border-red-400/30 bg-red-400/[0.04]'
              }`}
            >
              {txResult.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-[#4ADE80] flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <span className="text-sm flex-1">{txResult.msg}</span>
              <button
                onClick={() => setTxResult(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Position Card (connected + has stake) ── */}
        {isConnected && dataLoading && (
          <div className="border border-border/50 rounded-2xl p-8 mb-6 flex justify-center">
            <PulsingDots size="lg" />
          </div>
        )}

        <AnimatePresence>
          {isConnected && !dataLoading && hasStake && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="border border-border/50 rounded-2xl p-6 md:p-8 bg-muted/30 mb-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em]">
                  Your Position
                </h2>
                {lockExpired ? (
                  <span className="px-3 py-1 rounded-full text-xs font-medium border border-yellow-500/30 bg-yellow-500/[0.06] text-yellow-500">
                    Lock Expired
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-[#4ADE80]/30 bg-[#4ADE80]/[0.06] text-[#4ADE80]">
                    <Timer className="w-3 h-3" />
                    {formatTimeRemaining(account.unlock_at)}
                  </span>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <span className="text-xs text-muted-foreground">Locked</span>
                  <p className="text-lg font-semibold font-mono tracking-tight">
                    {formatSocial(account.locked_amount)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    Effective Stake
                  </span>
                  <p className="text-lg font-semibold font-mono tracking-tight">
                    {formatSocial(account.effective_stake)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    Period / Bonus
                  </span>
                  <p className="text-lg font-semibold">
                    {account.lock_months}mo{' '}
                    <span
                      style={{ color: LOCK_PERIODS[currentPeriodIdx]?.color }}
                    >
                      +{LOCK_PERIODS[currentPeriodIdx]?.bonus ?? 0}%
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    Pool Share
                  </span>
                  <p className="text-lg font-semibold font-mono tracking-tight">
                    {userSharePct > 0 ? `${userSharePct.toFixed(2)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Claimable Rewards */}
              <div className="border border-border/50 rounded-xl p-4 mb-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Gift className="w-3 h-3" /> Claimable Rewards
                    </span>
                    <p className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5 truncate">
                      {liveClaimable.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        SOCIAL
                      </span>
                    </p>
                    {perSecond > 0 && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        +{perSecond.toFixed(8)}/sec
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleClaim}
                    disabled={txPending || liveClaimable <= 0}
                    variant="accent"
                    size="sm"
                  >
                      {txPending ? <PulsingDots size="sm" /> : 'Claim Rewards'}
                    </Button>
                </div>
                {account.rewards_claimed !== '0' && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Previously claimed: {formatSocial(account.rewards_claimed)}{' '}
                    SOCIAL
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {lockExpired ? (
                  <Button
                    onClick={handleUnlock}
                    disabled={txPending}
                    className="gap-1.5"
                  >
                    <Unlock className="w-4 h-4" />
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
                      <RefreshCw className="w-3.5 h-3.5" />
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
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Extend Lock
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${showExtend ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Extend picker */}
              <AnimatePresence>
                {showExtend && extendOptions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <p className="text-xs text-muted-foreground mb-3">
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stake Form ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl border border-border/50 bg-muted/25 p-4 md:p-8"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(96,165,250,0.08),rgba(96,165,250,0))]" />
          <div className="relative mb-8 flex flex-col gap-4 border-b border-border/40 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Staking console
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
                {hasStake ? 'Increase your position' : 'Open a new position'}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Select a lock period, size your deposit, and preview the exact
                effective stake you will carry on-chain.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-w-[320px]">
              <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Selected lock
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: period.color }}>
                  {period.label} · +{period.bonus}%
                </p>
              </div>
              <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Unlock target
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground/90">
                  {formatUnlockDate(period.months)}
                </p>
              </div>
            </div>
          </div>

          {/* Lock Period Selector */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2">
              {hasStake ? 'Add to Your Stake' : 'Lock Period'}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Longer commitments increase effective stake and future reward share.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {LOCK_PERIODS.map((lp, index) => {
                const disabled = !!(
                  hasStake &&
                  !lockExpired &&
                  index !== currentPeriodIdx
                );
                return (
                  <button
                    key={lp.months}
                    onClick={() => !disabled && setSelectedPeriod(index)}
                    disabled={disabled}
                    className={`relative rounded-2xl border p-4 text-left transition-all ${
                      disabled
                        ? 'cursor-not-allowed border-border/30 bg-muted/20 opacity-30'
                        : selectedPeriod === index
                          ? 'border-border bg-background/70 shadow-[0_12px_30px_rgba(0,0,0,0.08)]'
                          : 'border-border/50 bg-background/30 hover:border-border hover:bg-background/50'
                    }`}
                  >
                    {lp.popular && !hasStake && (
                      <div className="absolute right-3 top-3 rounded-full border border-[#4ADE80]/40 bg-[#4ADE80]/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground">
                        Popular
                      </div>
                    )}
                    {hasStake && !lockExpired && index === currentPeriodIdx && (
                      <div className="absolute right-3 top-3 rounded-full border border-[#60A5FA]/40 bg-[#60A5FA]/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground">
                        Current
                      </div>
                    )}
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{lp.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {lp.tone}
                        </div>
                      </div>
                      <div className="rounded-full border border-border/40 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {lp.short}
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          Effective bonus
                        </div>
                        <div
                          className="mt-1 text-2xl font-bold tracking-[-0.03em]"
                          style={{ color: disabled ? undefined : lp.color }}
                        >
                          +{lp.bonus}%
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {hasStake && !lockExpired && (
              <p className="text-xs text-muted-foreground mt-3">
                Period locked to your current stake. Use{' '}
                <strong>Extend Lock</strong> above to switch.
              </p>
            )}
          </div>

          {/* Amount Input */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Amount</h3>
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm text-muted-foreground">
                  Amount to Stake
                </label>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {isConnected && (
                    <>
                      <span>
                        Balance:{' '}
                        <span className="font-mono">
                          {balanceNum.toLocaleString('en-US', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </span>
                      {balanceNum > 0 && (
                        <button
                          className="text-[#60A5FA] hover:underline"
                          onClick={() =>
                            setStakeAmount(yoctoToSocial(tokenBalance))
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
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0.00"
                  min="0.01"
                  step="any"
                  className="flex-1 min-w-0 bg-transparent text-2xl md:text-3xl font-bold outline-none tracking-[-0.02em] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-base text-muted-foreground">$SOCIAL</span>
              </div>
            </div>
          </div>

          {/* Effective Stake Breakdown */}
          {amount > 0 && (
            <div className="mb-8 rounded-2xl border border-border/40 bg-background/35 p-4 md:p-6">
              <h3 className="mb-4 text-base font-semibold">
                {hasStake ? 'New Effective Stake' : 'Your Effective Stake'}
              </h3>
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:items-start">
                <div className="space-y-3">
                  {hasStake && (
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
                        <span className="text-sm text-muted-foreground">
                          Adding
                        </span>
                        <span className="ml-2 truncate text-base font-semibold">
                          +{amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px bg-border/50" />
                    </>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {hasStake ? 'New Total Locked' : 'Locked Amount'}
                    </span>
                    <span className="ml-2 truncate text-base font-semibold">
                      {hasStake
                        ? (
                            parseFloat(yoctoToSocial(account.locked_amount)) + amount
                          ).toLocaleString()
                        : amount.toLocaleString()}{' '}
                      $SOCIAL
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
                    <span className="font-semibold">Effective Stake</span>
                    <span className="ml-2 truncate text-xl font-bold tracking-[-0.02em] md:text-2xl">
                      {hasStake
                        ? (
                            (parseFloat(yoctoToSocial(account.locked_amount)) + amount) *
                            (1 + period.bonus / 100)
                          ).toLocaleString('en-US', { maximumFractionDigits: 2 })
                        : effectiveStake.toLocaleString()}{' '}
                      $SOCIAL
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Effective outcome
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
                    {hasStake
                      ? (
                          (parseFloat(yoctoToSocial(account.locked_amount)) + amount) *
                          (1 + period.bonus / 100)
                        ).toLocaleString('en-US', { maximumFractionDigits: 2 })
                      : effectiveStake.toLocaleString()}{' '}
                    <span className="text-base font-normal text-muted-foreground">
                      $SOCIAL
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Unlocks on {formatUnlockDate(period.months)}
                    <span className="text-muted-foreground/60">
                      {' '}
                      (~{period.months * 30}d on-chain)
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />
                <span>
                  {hasStake ? (
                    <>
                      <strong className="text-foreground">Timer resets:</strong>{' '}
                      Adding tokens restarts your {period.label} lock from today.
                      Rewards are claimable anytime during the lock.
                    </>
                  ) : (
                    <>
                      <strong className="text-foreground">Important:</strong> Tokens are
                      locked for the full period. You can extend but not shorten.
                      Rewards are claimable anytime during the lock.
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* ── Pool Stats ── */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-6 grid grid-cols-1 gap-3 border-y border-border/30 py-5 sm:grid-cols-3"
          >
            <div className="px-2 text-center sm:border-r sm:border-border/20">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Total Staked
              </span>
              <p className="text-lg font-bold font-mono mt-1">
                {formatSocial(stats.total_locked)}
              </p>
            </div>
            <div className="px-2 text-center sm:border-r sm:border-border/20">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Reward Pool
              </span>
              <p className="text-lg font-bold font-mono mt-1">
                {formatSocial(stats.scheduled_pool)}
              </p>
            </div>
            <div className="px-2 text-center">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Total Released
              </span>
              <p className="text-lg font-bold font-mono mt-1">
                {formatSocial(stats.total_rewards_released)}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Info Cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div className="rounded-2xl border border-border/40 bg-background/30 p-6">
            <Zap className="w-5 h-5 text-[#4ADE80] mb-3" />
            <h3 className="text-sm font-semibold mb-1">Compound Decay</h3>
            <p className="text-xs text-muted-foreground">
              0.2% of the scheduled pool releases weekly. Your share = your
              stake-seconds ÷ total. Rewards never run out abruptly.
            </p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/30 p-6">
            <TrendingUp className="w-5 h-5 text-[#C084FC] mb-3" />
            <h3 className="text-sm font-semibold mb-1">Growing Pool</h3>
            <p className="text-xs text-muted-foreground">
              40% of every API credit purchase flows into the reward pool — more
              usage, more rewards.
            </p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/30 p-6">
            <Shield className="w-5 h-5 text-[#60A5FA] mb-3" />
            <h3 className="text-sm font-semibold mb-1">On-Chain & Trustless</h3>
            <p className="text-xs text-muted-foreground">
              All logic runs on{' '}
              <span className="font-mono text-foreground/70">
                {STAKING_CONTRACT}
              </span>
              . Auto-registered on first stake — no separate storage deposit.
            </p>
          </div>
        </motion.div>
    </PageShell>
  );
}
