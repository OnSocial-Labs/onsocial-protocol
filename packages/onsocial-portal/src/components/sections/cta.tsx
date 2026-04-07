'use client';

import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Coins, Handshake } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { ArrowUpRight } from 'lucide-react';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { section } from '@/lib/section-styles';
import {
  BOOST_CONTRACT,
  REWARDS_CONTRACT,
  viewContractAt,
  yoctoToSocial,
  type BoostStats,
  type RewardsAppConfigView,
  type RewardsUserRewardsOverviewView,
} from '@/lib/near-rpc';

interface RewardsContractInfoView {
  pool_balance: string;
  total_credited: string;
  total_claimed: string;
  app_ids: string[];
}

function formatCompactSocial(yocto: string): string {
  const social = Number.parseFloat(yoctoToSocial(yocto));

  if (!Number.isFinite(social)) {
    return '0';
  }

  return social.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: social >= 1000 ? 0 : social >= 1 ? 2 : 4,
  });
}

export function CTA() {
  const { accountId, isConnected } = useWallet();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [boostStats, setBoostStats] = useState<BoostStats | null>(null);
  const [boostLoading, setBoostLoading] = useState(true);
  const [rewardsContractInfo, setRewardsContractInfo] =
    useState<RewardsContractInfoView | null>(null);
  const [rewardsNetworkLoading, setRewardsNetworkLoading] = useState(true);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardsOverview, setRewardsOverview] =
    useState<RewardsUserRewardsOverviewView | null>(null);
  const [topRewardApp, setTopRewardApp] = useState<{
    label: string;
    totalEarned: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      viewContractAt<BoostStats>(BOOST_CONTRACT, 'get_stats', {}),
      viewContractAt<RewardsContractInfoView>(
        REWARDS_CONTRACT,
        'get_contract_info',
        {}
      ),
    ])
      .then(([stats, contractInfo]) => {
        if (!cancelled) {
          setBoostStats(stats);
          setRewardsContractInfo(contractInfo);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRewardsContractInfo(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBoostLoading(false);
          setRewardsNetworkLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accountId) {
      setRewardsOverview(null);
      setTopRewardApp(null);
      setRewardsLoading(false);
      return;
    }

    let cancelled = false;
    setRewardsLoading(true);

    Promise.all([
      viewContractAt<RewardsUserRewardsOverviewView>(
        REWARDS_CONTRACT,
        'get_user_rewards_overview',
        { account_id: accountId }
      ),
      viewContractAt<string[]>(REWARDS_CONTRACT, 'get_all_apps', {}),
    ])
      .then(async ([overview, appIds]) => {
        if (cancelled) {
          return;
        }

        setRewardsOverview(overview);

        const appList = appIds ?? [];
        const appProgress = await Promise.all(
          appList.map(async (appId) => {
            const [config, appOverview] = await Promise.all([
              viewContractAt<RewardsAppConfigView>(
                REWARDS_CONTRACT,
                'get_app_config',
                { app_id: appId }
              ),
              viewContractAt<RewardsUserRewardsOverviewView>(
                REWARDS_CONTRACT,
                'get_user_rewards_overview',
                { account_id: accountId, app_id: appId }
              ),
            ]);

            return {
              label: config?.label || appId,
              totalEarned: appOverview?.app?.total_earned ?? '0',
            };
          })
        );

        if (cancelled) {
          return;
        }

        const rankedApps = appProgress
          .filter((app) => BigInt(app.totalEarned) > 0n)
          .sort((left, right) => {
            const leftTotal = BigInt(left.totalEarned);
            const rightTotal = BigInt(right.totalEarned);

            if (leftTotal === rightTotal) {
              return left.label.localeCompare(right.label);
            }

            return rightTotal > leftTotal ? 1 : -1;
          });

        setTopRewardApp(rankedApps[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setRewardsOverview(null);
          setTopRewardApp(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRewardsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const boostPreviewStats = boostStats
    ? [
        {
          label: 'Locked',
          value: formatCompactSocial(boostStats.total_locked),
          valueClassName:
            'portal-slate-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Pool',
          value: formatCompactSocial(boostStats.scheduled_pool),
          valueClassName:
            'portal-blue-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Distributed',
          value: formatCompactSocial(boostStats.total_rewards_released),
          valueClassName:
            'portal-slate-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
      ]
    : [];

  const networkRewardsStats = rewardsContractInfo
    ? [
        {
          label: 'Distributed',
          value: formatCompactSocial(rewardsContractInfo.total_credited),
          valueClassName:
            'portal-purple-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Pool',
          value: formatCompactSocial(rewardsContractInfo.pool_balance),
          valueClassName:
            'portal-blue-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Apps',
          value: (rewardsContractInfo.app_ids?.length ?? 0).toLocaleString(
            'en-US'
          ),
          valueClassName:
            'portal-slate-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
      ]
    : [];

  const claimableAmount = rewardsOverview
    ? BigInt(rewardsOverview.claimable)
    : 0n;
  const totalEarnedAmount = rewardsOverview
    ? BigInt(rewardsOverview.total_earned)
    : 0n;
  const hasPersonalRewards = claimableAmount > 0n || totalEarnedAmount > 0n;

  return (
    <section id="paths" ref={ref} className={`${section.py} relative`}>
      <div className={section.container}>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45 }}
          className={section.heading}
        >
          Live
        </motion.h2>
        <div className={section.grid}>
          <Link href="/partners" className="group">
            <SurfacePanel
              radius="xl"
              tone="solid"
              borderTone="strong"
              padding="none"
              className="h-full overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-[var(--portal-purple-border-strong)] hover:shadow-[0_0_20px_var(--portal-purple-shadow)]"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 }}
                className={section.card}
              >
                <div className="flex flex-col items-center text-center gap-1">
                  <span className="portal-purple-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]">
                    <Handshake className="portal-purple-icon h-3.5 w-3.5" />
                    Collab
                    <ArrowUpRight className="h-3 w-3 opacity-40 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Social activity rewards — in your Telegram group.
                  </p>
                </div>

              <div className="pt-4">
                {rewardsNetworkLoading ? (
                  <div className="flex min-h-16 items-center justify-center">
                    <PulsingDots size="md" />
                  </div>
                ) : networkRewardsStats.length ? (
                  <StatStrip>
                    {networkRewardsStats.map((stat, index) => (
                      <StatStripCell
                        key={stat.label}
                        label={stat.label}
                        showDivider={index < networkRewardsStats.length - 1}
                      >
                        <p className={stat.valueClassName}>{stat.value}</p>
                      </StatStripCell>
                    ))}
                  </StatStrip>
                ) : null}

                {topRewardApp || isConnected ? (
                  <div className="mt-3 px-1 pt-3">
                    {isConnected && rewardsLoading ? (
                      <div className="flex min-h-10 items-center justify-center">
                        <PulsingDots size="sm" />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                        {topRewardApp ? (
                          <>
                            <span className="uppercase tracking-[0.14em]">
                              Top App
                            </span>
                            <span className="portal-purple-text min-w-0 truncate font-medium tracking-[-0.02em]">
                              {topRewardApp.label}
                            </span>
                          </>
                        ) : null}

                        {topRewardApp && isConnected && hasPersonalRewards ? (
                          <span className="text-border">·</span>
                        ) : null}

                        {isConnected &&
                        rewardsOverview &&
                        hasPersonalRewards ? (
                          <>
                            <span className="uppercase tracking-[0.14em]">
                              Yours
                            </span>
                            <span>
                              <span className="portal-slate-text font-mono font-semibold tracking-tight">
                                {formatCompactSocial(
                                  rewardsOverview.total_earned
                                )}
                              </span>{' '}
                              collected
                            </span>
                            <span className="text-border">·</span>
                            <span>
                              <span className="portal-purple-text font-mono font-semibold tracking-tight">
                                {formatCompactSocial(rewardsOverview.claimable)}
                              </span>{' '}
                              ready
                            </span>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              </motion.div>
            </SurfacePanel>
          </Link>

          <Link href="/boost" className="group">
            <SurfacePanel
              radius="xl"
              tone="solid"
              borderTone="strong"
              padding="none"
              className="h-full overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-[var(--portal-blue-border-strong)] hover:shadow-[0_0_20px_var(--portal-blue-shadow)]"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.2 }}
                className={section.card}
              >
                <div className="flex flex-col items-center text-center gap-1">
                  <span className="portal-blue-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]">
                    <Coins className="portal-blue-icon h-3.5 w-3.5" />
                    Boost
                    <ArrowUpRight className="h-3 w-3 opacity-40 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Lock SOCIAL to grow influence and collect rewards.
                  </p>
                </div>

              <div className="pt-4">
                {boostLoading ? (
                  <div className="flex min-h-16 items-center justify-center">
                    <PulsingDots size="md" />
                  </div>
                ) : (
                  <StatStrip>
                    {boostPreviewStats.map((stat, index) => (
                      <StatStripCell
                        key={stat.label}
                        label={stat.label}
                        showDivider={index < boostPreviewStats.length - 1}
                      >
                        <p className={stat.valueClassName}>{stat.value}</p>
                      </StatStripCell>
                    ))}
                  </StatStrip>
                )}
              </div>
              </motion.div>
            </SurfacePanel>
          </Link>
        </div>
      </div>
    </section>
  );
}
