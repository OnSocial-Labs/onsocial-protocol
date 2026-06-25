'use client';

import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Coins, Handshake } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { GenesisRallyStrip } from '@/features/season/genesis-rally-strip';
import type { LiveCtaPayload } from '@/lib/portal-live-cta-server';
import { section } from '@/lib/section-styles';
import { yoctoToSocial } from '@/lib/near-rpc';

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

async function fetchLiveCta(accountId: string | null): Promise<LiveCtaPayload> {
  const search = new URLSearchParams();
  if (accountId) search.set('accountId', accountId);

  const query = search.toString();
  const response = await fetch(
    query ? `/api/live/cta?${query}` : '/api/live/cta',
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<LiveCtaPayload> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Live section query failed (${response.status})`
    );
  }

  return {
    boost: body?.boost ?? null,
    rewards: body?.rewards ?? null,
    personal: body?.personal ?? null,
  };
}

export function CTA() {
  const { accountId, isConnected } = useWallet();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [liveData, setLiveData] = useState<LiveCtaPayload | null>(null);
  const [networkLoading, setNetworkLoading] = useState(true);
  const [personalLoading, setPersonalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetchLiveCta(null)
      .then((payload) => {
        if (!cancelled) {
          setLiveData((current) => ({
            boost: payload.boost,
            rewards: payload.rewards,
            personal: current?.personal ?? null,
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveData((current) => ({
            boost: null,
            rewards: null,
            personal: current?.personal ?? null,
          }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNetworkLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accountId) {
      setLiveData((current) =>
        current ? { ...current, personal: null } : current
      );
      setPersonalLoading(false);
      return;
    }

    let cancelled = false;
    setPersonalLoading(true);

    void fetchLiveCta(accountId)
      .then((payload) => {
        if (!cancelled) {
          setLiveData((current) => ({
            boost: current?.boost ?? payload.boost,
            rewards: current?.rewards ?? payload.rewards,
            personal: payload.personal,
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveData((current) =>
            current ? { ...current, personal: null } : current
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPersonalLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const boostPreviewStats = liveData?.boost
    ? [
        {
          label: 'Locked',
          value: formatCompactSocial(liveData.boost.totalLocked),
          valueClassName:
            'text-portal-neutral mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Pool',
          value: formatCompactSocial(liveData.boost.scheduledPool),
          valueClassName:
            'portal-blue-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Distributed',
          value: formatCompactSocial(liveData.boost.totalRewardsReleased),
          valueClassName:
            'text-portal-neutral mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
      ]
    : [];

  const networkRewardsStats = liveData?.rewards
    ? [
        {
          label: 'Distributed',
          value: formatCompactSocial(liveData.rewards.totalCredited),
          valueClassName:
            'portal-purple-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Pool',
          value: formatCompactSocial(liveData.rewards.poolBalance),
          valueClassName:
            'portal-blue-text mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
        {
          label: 'Apps',
          value: liveData.rewards.appCount.toLocaleString('en-US'),
          valueClassName:
            'text-portal-neutral mt-1 font-mono text-sm font-semibold tracking-tight md:text-base',
        },
      ]
    : [];

  const personal = liveData?.personal;
  const topRewardApp = personal?.topRewardApp ?? null;
  const claimableAmount = personal ? BigInt(personal.claimable || '0') : 0n;
  const totalEarnedAmount = personal ? BigInt(personal.totalEarned || '0') : 0n;
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
          Rally
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-4"
        >
          <GenesisRallyStrip variant="promo" />
        </motion.div>

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
                    <ProtocolMotionArrow className="h-3 w-3" />
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Social activity rewards — in your Telegram group.
                  </p>
                </div>

                <div className="pt-4">
                  {networkLoading ? (
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
                      {isConnected && personalLoading ? (
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

                          {isConnected && personal && hasPersonalRewards ? (
                            <>
                              <span className="uppercase tracking-[0.14em]">
                                Yours
                              </span>
                              <span>
                                <span className="text-portal-neutral font-mono font-semibold tracking-tight">
                                  {formatCompactSocial(personal.totalEarned)}
                                </span>{' '}
                                collected
                              </span>
                              <span className="text-border">·</span>
                              <span>
                                <span className="portal-purple-text font-mono font-semibold tracking-tight">
                                  {formatCompactSocial(personal.claimable)}
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
                    <ProtocolMotionArrow className="h-3 w-3" />
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Lock SOCIAL to grow influence and collect rewards.
                  </p>
                </div>

                <div className="pt-4">
                  {networkLoading ? (
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
