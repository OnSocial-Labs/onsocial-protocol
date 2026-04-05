'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Gift,
  Key,
  Lock,
  PieChart,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import {
  InsetDividerGroup,
  InsetDividerItem,
} from '@/components/ui/inset-divider-group';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import {
  REWARDS_CONTRACT,
  TOKEN_CONTRACT,
  viewContractAtOnNetwork,
  yoctoToSocial,
} from '@/lib/near-rpc';
import {
  ACTIVE_API_URL,
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
  NEAR_ACCOUNT_SUFFIX,
} from '@/lib/portal-config';
import {
  portalColors,
  portalFrameStyle,
  type PortalAccent,
} from '@/lib/portal-colors';

const NETWORK = ACTIVE_NEAR_NETWORK;
const API_URL = ACTIVE_API_URL;
const NEARBLOCKS_BASE_URL = ACTIVE_NEAR_EXPLORER_URL;
const TOKEN_NEARBLOCKS_URL = `${NEARBLOCKS_BASE_URL}/token/${TOKEN_CONTRACT}`;
const TOKEN_HOLDERS_URL = `${TOKEN_NEARBLOCKS_URL}?tab=holders`;
const INITIAL_SUPPLY_TOKENS = 1_000_000_000n;
const TOKEN_DECIMALS = 18n;
const INITIAL_SUPPLY_YOCTO = INITIAL_SUPPLY_TOKENS * 10n ** TOKEN_DECIMALS;
const RHEA_CONTRACT = 'v2.ref-finance.near';
const RHEA_SOCIAL_TOKEN = 'token.onsocial.near';
const MARKET_LIQUIDITY_POOLS = [
  {
    label: 'SOCIAL-USDC',
    href: 'https://app.rhea.finance/pool/6771',
    poolId: 6771,
  },
  {
    label: 'SOCIAL-wNEAR',
    href: 'https://app.rhea.finance/pool/6783',
    poolId: 6783,
  },
];

function allocationAccount(name: string): string {
  return `${name}.${NEAR_ACCOUNT_SUFFIX}`;
}

const LIVE_ALLOCATION_ACCOUNTS = [
  {
    label: 'Reward Pool',
    account: allocationAccount('rewards'),
    accent: 'purple' as PortalAccent,
    desc: 'Community incentives and partner growth flows.',
  },
  {
    label: 'Treasury',
    account: allocationAccount('treasury'),
    accent: 'blue' as PortalAccent,
    desc: 'Growth, contributors, liquidity, and network buildout under one treasury wallet.',
  },
  {
    label: 'Influence Pool',
    account: allocationAccount('boost'),
    accent: 'green' as PortalAccent,
    desc: 'Boost commitments, influence, and participation flows.',
  },
  {
    label: 'Founder Vesting',
    account: allocationAccount('founder-vesting'),
    accent: 'amber' as PortalAccent,
    desc: 'Founder allocation under long-term vesting.',
  },
];

const TOKEN_UTILITY = [
  {
    icon: Lock,
    eyebrow: 'Boost',
    label: 'Grow Your Influence',
    desc: 'Lock SOCIAL to grow influence across the network.',
    accent: 'blue' as PortalAccent,
    href: '/boost',
    ctaLabel: 'Open Boost',
  },
  {
    icon: Key,
    eyebrow: 'Infrastructure',
    label: 'Build with SOCIAL',
    desc: 'Use SOCIAL to unlock infrastructure and power dApps on OnSocial.',
    accent: 'green' as PortalAccent,
    href: '/onapi',
    ctaLabel: 'Open OnApi',
  },
  {
    icon: Gift,
    eyebrow: 'Participation',
    label: 'Participate & Grow',
    desc: 'Engage across OnSocial and partner dApps to build presence.',
    accent: 'purple' as PortalAccent,
    href: '/partners',
    ctaLabel: 'Open Partners',
  },
  {
    icon: PieChart,
    eyebrow: 'Governance',
    label: 'Public Governance',
    desc: 'Track proposals and review governance in the open.',
    accent: 'slate' as PortalAccent,
    href: '/governance',
    ctaLabel: 'Open Governance',
  },
];

interface TokenMetadataView {
  icon?: string | null;
  decimals?: number;
  symbol?: string;
}

interface NearBlocksFungibleTokenView {
  contracts?: Array<{
    coingecko_id?: string | null;
    icon?: string | null;
  }>;
}

interface CoinGeckoTokenView {
  image?: {
    large?: string;
    small?: string;
    thumb?: string;
  };
}

interface RefPoolView {
  amounts: string[];
  shares_total_supply: string;
  token_account_ids: string[];
}

interface RewardsContractInfoView {
  pool_balance: string;
}

interface MarketLiquidityPool {
  href: string;
  lpShares: string;
  pairedAmount: string;
  pairedIcon: string | null;
  pairedSymbol: string;
  poolId: number;
  socialAmount: string;
  socialAmountRaw: bigint;
}

const tokenIconFallbackCache = new Map<string, Promise<string | null>>();

async function fetchFallbackTokenIcon(tokenId: string): Promise<string | null> {
  if (NETWORK !== 'mainnet') {
    return null;
  }

  if (!tokenIconFallbackCache.has(tokenId)) {
    tokenIconFallbackCache.set(
      tokenId,
      (async () => {
        const nearBlocksResponse = await fetch(
          `https://api.nearblocks.io/v1/fts/${tokenId}`,
          { signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (!nearBlocksResponse?.ok) {
          return null;
        }

        const nearBlocksData =
          (await nearBlocksResponse.json()) as NearBlocksFungibleTokenView;
        const contract = nearBlocksData.contracts?.[0];

        if (contract?.icon) {
          return contract.icon;
        }

        if (!contract?.coingecko_id) {
          return null;
        }

        const coinGeckoResponse = await fetch(
          `https://api.coingecko.com/api/v3/coins/${contract.coingecko_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
          { signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (!coinGeckoResponse?.ok) {
          return null;
        }

        const coinGeckoData =
          (await coinGeckoResponse.json()) as CoinGeckoTokenView;

        return (
          coinGeckoData.image?.small ??
          coinGeckoData.image?.thumb ??
          coinGeckoData.image?.large ??
          null
        );
      })()
    );
  }

  return tokenIconFallbackCache.get(tokenId) ?? null;
}

function formatWholeTokenAmount(raw: string): string {
  const human = yoctoToSocial(raw);
  const whole = BigInt(human.split('.')[0] || '0');
  return whole.toLocaleString('en-US');
}

function formatTokenAmount(
  raw: string,
  decimals: number,
  maxFractionDigits = 2
): string {
  if (!raw || raw === '0') {
    return '0';
  }

  const padded = raw.padStart(decimals + 1, '0');
  const whole = BigInt(padded.slice(0, padded.length - decimals) || '0');
  const fraction = padded
    .slice(padded.length - decimals)
    .replace(/0+$/, '')
    .slice(0, maxFractionDigits);

  return fraction
    ? `${whole.toLocaleString('en-US')}.${fraction}`
    : whole.toLocaleString('en-US');
}

function formatPercent(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) {
    return '0.0';
  }

  const tenths = (numerator * 1000n) / denominator;
  const whole = tenths / 10n;
  const fraction = tenths % 10n;

  return `${whole.toString()}.${fraction.toString()}`;
}

function getAccountLink(account: string): string | null {
  return account.endsWith('.near') || account.endsWith('.testnet')
    ? `${NEARBLOCKS_BASE_URL}/address/${account}`
    : null;
}

function MiniTokenIcon({
  src,
  label,
  className = '',
}: {
  src?: string | null;
  label: string;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={`h-4 w-4 rounded-full object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/50 bg-muted/40 text-[8px] font-bold uppercase text-foreground/80 ${className}`.trim()}
    >
      {label.slice(0, 1)}
    </span>
  );
}

export default function TransparencyPage() {
  const ref = useRef(null);
  const distributionInteractionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });
  const [hoveredDistributionIndex, setHoveredDistributionIndex] = useState<
    number | null
  >(null);
  const [selectedDistributionIndex, setSelectedDistributionIndex] = useState<
    number | null
  >(null);
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState('SOCIAL');
  const [copiedTokenContract, setCopiedTokenContract] = useState(false);
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [holderCountLoaded, setHolderCountLoaded] = useState(false);
  const [currentSupplyDisplay, setCurrentSupplyDisplay] = useState<
    string | null
  >(null);
  const [currentSupplyYocto, setCurrentSupplyYocto] = useState<bigint | null>(
    null
  );
  const [burnedDisplay, setBurnedDisplay] = useState<string | null>(null);
  const [supplyLoaded, setSupplyLoaded] = useState(false);
  const [liveAccountBalances, setLiveAccountBalances] = useState<
    Record<string, bigint | null>
  >({});
  const [liveAccountBalancesLoaded, setLiveAccountBalancesLoaded] =
    useState(false);
  const [rewardsPoolBalance, setRewardsPoolBalance] = useState<bigint | null>(
    null
  );
  const [rewardsPoolBalanceLoaded, setRewardsPoolBalanceLoaded] =
    useState(false);
  const [marketLiquidityPools, setMarketLiquidityPools] = useState<
    MarketLiquidityPool[]
  >([]);
  const [marketLiquidityLoaded, setMarketLiquidityLoaded] = useState(
    NETWORK !== 'mainnet'
  );

  const getTrackedBalance = (account: string): bigint | null =>
    account === REWARDS_CONTRACT
      ? rewardsPoolBalance
      : (liveAccountBalances[account] ?? null);

  const isTrackedBalanceLoaded = (account: string): boolean =>
    account === REWARDS_CONTRACT
      ? rewardsPoolBalanceLoaded
      : liveAccountBalancesLoaded;

  const totalSocialInPools = marketLiquidityPools.reduce(
    (total, pool) => total + pool.socialAmountRaw,
    0n
  );

  const liveTrackedTotal = LIVE_ALLOCATION_ACCOUNTS.reduce((total, item) => {
    const balance = getTrackedBalance(item.account);
    return total + (balance ?? 0n);
  }, 0n);

  const liveDistribution = LIVE_ALLOCATION_ACCOUNTS.map((item) => {
    const balance = getTrackedBalance(item.account);
    const pctOfSupply =
      balance !== null && currentSupplyYocto !== null && currentSupplyYocto > 0n
        ? Number((balance * 10000n) / currentSupplyYocto) / 100
        : 0;

    return {
      ...item,
      balance,
      balanceDisplay:
        balance !== null ? formatWholeTokenAmount(balance.toString()) : '--',
      pctOfSupplyDisplay:
        balance !== null &&
        currentSupplyYocto !== null &&
        currentSupplyYocto > 0n
          ? formatPercent(balance, currentSupplyYocto)
          : '0.0',
      pctOfSupply,
    };
  });

  const untrackedBalance =
    currentSupplyYocto !== null && currentSupplyYocto > liveTrackedTotal
      ? currentSupplyYocto - liveTrackedTotal
      : 0n;

  const barDistribution = [
    ...liveDistribution,
    {
      label: 'Other Holders',
      account: 'other-holders',
      accent: 'slate' as PortalAccent,
      desc: 'Current supply held outside the tracked protocol allocation accounts.',
      balance: untrackedBalance,
      balanceDisplay: formatWholeTokenAmount(untrackedBalance.toString()),
      pctOfSupplyDisplay:
        currentSupplyYocto !== null && currentSupplyYocto > 0n
          ? formatPercent(untrackedBalance, currentSupplyYocto)
          : '0.0',
      pctOfSupply:
        currentSupplyYocto !== null && currentSupplyYocto > 0n
          ? Number((untrackedBalance * 10000n) / currentSupplyYocto) / 100
          : 0,
    },
  ];

  const activeDistributionIndex =
    selectedDistributionIndex ?? hoveredDistributionIndex;
  const activeDistribution =
    activeDistributionIndex !== null
      ? barDistribution[activeDistributionIndex]
      : null;

  useEffect(() => {
    viewContractAtOnNetwork<TokenMetadataView>(
      NETWORK,
      TOKEN_CONTRACT,
      'ft_metadata',
      {}
    )
      .then((metadata) => {
        if (metadata?.icon) {
          setTokenIconSrc(metadata.icon);
        }
        if (metadata?.symbol) {
          setTokenSymbol(metadata.symbol);
        }
      })
      .catch(() => {});

    viewContractAtOnNetwork<string>(
      NETWORK,
      TOKEN_CONTRACT,
      'ft_total_supply',
      {}
    )
      .then((totalSupply) => {
        if (totalSupply) {
          const currentSupplyYocto = BigInt(totalSupply);
          const burnedYocto =
            currentSupplyYocto <= INITIAL_SUPPLY_YOCTO
              ? INITIAL_SUPPLY_YOCTO - currentSupplyYocto
              : 0n;

          setCurrentSupplyYocto(currentSupplyYocto);
          setCurrentSupplyDisplay(formatWholeTokenAmount(totalSupply));
          setBurnedDisplay(formatWholeTokenAmount(burnedYocto.toString()));
        }
      })
      .catch(() => {})
      .finally(() => setSupplyLoaded(true));

    fetch(`${API_URL}/graph/token-stats`, {
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { holders?: number };
      })
      .then((data) => {
        if (typeof data?.holders === 'number') {
          setHolderCount(data.holders);
        }
      })
      .catch(() => {})
      .finally(() => setHolderCountLoaded(true));

    Promise.all(
      LIVE_ALLOCATION_ACCOUNTS.map(async ({ account }) => {
        if (account === REWARDS_CONTRACT) {
          return [account, null] as const;
        }

        const balance = await viewContractAtOnNetwork<string>(
          NETWORK,
          TOKEN_CONTRACT,
          'ft_balance_of',
          { account_id: account }
        ).catch(() => null);

        return [account, balance ? BigInt(balance) : null] as const;
      })
    )
      .then((entries) => {
        setLiveAccountBalances(Object.fromEntries(entries));
      })
      .catch(() => {})
      .finally(() => setLiveAccountBalancesLoaded(true));

    viewContractAtOnNetwork<RewardsContractInfoView>(
      NETWORK,
      REWARDS_CONTRACT,
      'get_contract_info',
      {}
    )
      .then((contractInfo) => {
        if (contractInfo?.pool_balance) {
          setRewardsPoolBalance(BigInt(contractInfo.pool_balance));
        }
      })
      .catch(() => {})
      .finally(() => setRewardsPoolBalanceLoaded(true));

    if (NETWORK === 'mainnet') {
      Promise.all(
        MARKET_LIQUIDITY_POOLS.map(async ({ href, poolId }) => {
          const pool = await viewContractAtOnNetwork<RefPoolView>(
            'mainnet',
            RHEA_CONTRACT,
            'get_pool',
            { pool_id: poolId }
          ).catch(() => null);

          if (!pool?.token_account_ids?.length || !pool.amounts?.length) {
            return null;
          }

          const socialIndex = pool.token_account_ids.findIndex(
            (accountId) => accountId === RHEA_SOCIAL_TOKEN
          );
          if (socialIndex === -1) {
            return null;
          }

          const pairedIndex = pool.token_account_ids.findIndex(
            (_, index) => index !== socialIndex
          );
          if (pairedIndex === -1) {
            return null;
          }

          const pairedTokenId = pool.token_account_ids[pairedIndex];
          const pairedMetadata =
            await viewContractAtOnNetwork<TokenMetadataView>(
              'mainnet',
              pairedTokenId,
              'ft_metadata',
              {}
            ).catch(() => null);
          const pairedIcon =
            pairedMetadata?.icon ??
            (await fetchFallbackTokenIcon(pairedTokenId));

          return {
            href,
            lpShares: formatTokenAmount(pool.shares_total_supply ?? '0', 24, 2),
            pairedAmount: formatTokenAmount(
              pool.amounts[pairedIndex] ?? '0',
              pairedMetadata?.decimals ?? 6,
              3
            ),
            pairedIcon,
            pairedSymbol: pairedMetadata?.symbol ?? 'Token',
            poolId,
            socialAmount: formatTokenAmount(
              pool.amounts[socialIndex] ?? '0',
              18,
              3
            ),
            socialAmountRaw: BigInt(pool.amounts[socialIndex] ?? '0'),
          } satisfies MarketLiquidityPool;
        })
      )
        .then((pools) => {
          setMarketLiquidityPools(
            pools.filter((pool) => pool !== null) as MarketLiquidityPool[]
          );
        })
        .catch(() => {})
        .finally(() => setMarketLiquidityLoaded(true));
    }
  }, []);

  useEffect(() => {
    if (selectedDistributionIndex === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideBar =
        distributionInteractionRef.current?.contains(target) ?? false;

      if (!insideBar) {
        setSelectedDistributionIndex(null);
        setHoveredDistributionIndex(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [selectedDistributionIndex]);

  const handleCopyTokenContract = async () => {
    await navigator.clipboard.writeText(TOKEN_CONTRACT);
    setCopiedTokenContract(true);
    setTimeout(() => setCopiedTokenContract(false), 2000);
  };

  function renderStatValue(value: string | null, loaded: boolean) {
    if (!loaded) {
      return <PulsingDots size="sm" className="text-muted-foreground" />;
    }

    if (!value) {
      return <span aria-label="Unavailable">--</span>;
    }

    return value;
  }

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Network Transparency"
        badgeAccent="blue"
        glowAccents={['blue', 'purple']}
        className="mb-10"
        contentClassName="max-w-3xl"
        childrenClassName="justify-center"
        title="See how SOCIAL flows across the network"
        description="Track where tokens live, how they are allocated, and how the protocol evolves over time."
      >
        <div className="max-w-full">
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="none"
            className="inline-flex max-w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm"
          >
            {tokenIconSrc ? (
              <img
                src={tokenIconSrc}
                alt={tokenSymbol}
                className="h-6 w-6 rounded-full object-cover"
                onError={() => setTokenIconSrc(null)}
              />
            ) : (
              <PortalBadge
                accent="blue"
                size="icon"
                weight="semibold"
                className="h-6 w-6 text-[11px]"
              >
                {tokenSymbol.slice(0, 1)}
              </PortalBadge>
            )}
            <PortalBadge
              accent="slate"
              size="sm"
              casing="uppercase"
              tracking="tight"
            >
              {tokenSymbol}
            </PortalBadge>
            <a
              href={`${NEARBLOCKS_BASE_URL}/address/${TOKEN_CONTRACT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-xs portal-link"
            >
              {TOKEN_CONTRACT}
            </a>
            <button
              type="button"
              onClick={handleCopyTokenContract}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
              title={copiedTokenContract ? 'Copied!' : 'Copy token contract'}
              aria-label={
                copiedTokenContract
                  ? 'Copied token contract'
                  : 'Copy token contract'
              }
            >
              {copiedTokenContract ? (
                <Check className="portal-green-icon h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <a
              href={`${NEARBLOCKS_BASE_URL}/address/${TOKEN_CONTRACT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
              aria-label="Open token contract on Nearblocks"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </SurfacePanel>
          <p className="mt-3 text-center text-xs uppercase tracking-[0.16em] text-muted-foreground">
            NEP-141 · 18 Decimals · Burnable
          </p>
        </div>
      </SecondaryPageHeader>

      {/* ── Key Stats ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <SectionHeader badge="Supply Overview" className="mb-4" />
        <StatStrip>
          <StatStripCell label="Total Supply" showDivider>
            <a
              href={TOKEN_NEARBLOCKS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-sm font-bold portal-link md:text-base"
            >
              {renderStatValue(currentSupplyDisplay, supplyLoaded)}
            </a>
          </StatStripCell>
          <StatStripCell label="Burned" showDivider>
            <a
              href={TOKEN_NEARBLOCKS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-sm font-bold portal-link md:text-base"
            >
              {renderStatValue(burnedDisplay, supplyLoaded)}
            </a>
          </StatStripCell>
          <StatStripCell label="Unique Holders">
            <a
              href={TOKEN_HOLDERS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-sm font-bold portal-link md:text-base"
            >
              {!holderCountLoaded ? (
                <PulsingDots size="sm" className="text-muted-foreground" />
              ) : holderCount !== null ? (
                holderCount.toLocaleString()
              ) : (
                <span aria-label="Unavailable">--</span>
              )}
            </a>
          </StatStripCell>
        </StatStrip>
      </motion.div>

      {/* ── Distribution Card ── */}
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="p-5 md:p-8"
        >
          <SectionHeader badge="Live Allocation" />

          {/* Interactive Distribution Bar */}
          <div className="relative mb-5 pt-10">
            {activeDistribution ? (
              <div className="absolute inset-x-0 top-0 z-10 flex justify-center pointer-events-none">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/95 px-3 py-1.5 shadow-lg shadow-black/10 backdrop-blur-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: portalColors[activeDistribution.accent],
                    }}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/85">
                    {activeDistribution.label}
                  </span>
                  <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {activeDistribution.balanceDisplay} ·{' '}
                    {activeDistribution.pctOfSupplyDisplay}%
                  </span>
                </div>
              </div>
            ) : null}

            <div
              ref={distributionInteractionRef}
              className="overflow-hidden rounded-full bg-border/30"
              onMouseLeave={() => {
                if (selectedDistributionIndex === null) {
                  setHoveredDistributionIndex(null);
                }
              }}
            >
              <div className="flex h-[18px] items-center gap-px">
                {barDistribution.map((d, index) => (
                  <button
                    key={d.label}
                    type="button"
                    style={{
                      width: `${d.pctOfSupply}%`,
                      backgroundColor: portalColors[d.accent],
                      minWidth: d.balance && d.balance > 0n ? '8px' : '0px',
                    }}
                    onMouseEnter={() => {
                      if (selectedDistributionIndex === null) {
                        setHoveredDistributionIndex(index);
                      }
                    }}
                    onFocus={() => {
                      if (selectedDistributionIndex === null) {
                        setHoveredDistributionIndex(index);
                      }
                    }}
                    onClick={() => {
                      setSelectedDistributionIndex((current) =>
                        current === index ? null : index
                      );
                      setHoveredDistributionIndex(index);
                    }}
                    onBlur={() =>
                      setHoveredDistributionIndex((current) => {
                        if (selectedDistributionIndex !== null) {
                          return current;
                        }
                        return current === index ? null : current;
                      })
                    }
                    aria-label={`${d.label}: ${d.balanceDisplay} SOCIAL, ${d.pctOfSupplyDisplay}% of current supply`}
                    aria-pressed={selectedDistributionIndex === index}
                    className={`first:rounded-l-full last:rounded-r-full focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200 ${
                      selectedDistributionIndex === index
                        ? 'h-[18px] shadow-[0_0_0_1px_rgba(255,255,255,0.45)]'
                        : 'h-4'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-fade-section pt-8">
            <div className="divide-y divide-fade-section">
              {LIVE_ALLOCATION_ACCOUNTS.map((item) => {
                const link = getAccountLink(item.account);
                const distributionEntry = liveDistribution.find(
                  (entry) => entry.account === item.account
                );
                const pctOfSupplyDisplay = isTrackedBalanceLoaded(item.account)
                  ? (distributionEntry?.pctOfSupplyDisplay ?? '0.0')
                  : '...';
                const balanceDisplay = isTrackedBalanceLoaded(item.account)
                  ? (distributionEntry?.balanceDisplay ?? '--')
                  : '...';

                return (
                  <div key={item.account} className="py-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: portalColors[item.accent] }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                            {item.label}
                          </p>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            <span className="font-mono text-foreground/80">
                              {pctOfSupplyDisplay}%
                            </span>{' '}
                            of current supply
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          Live{' '}
                          <span className="font-mono font-semibold tracking-tight text-foreground/85">
                            {balanceDisplay} SOCIAL
                          </span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {link ? (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 break-all font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {item.account}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.account}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SurfacePanel>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="mb-8"
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="p-5 md:p-8"
        >
          <SectionHeader badge="Market Liquidity" />

          <StatStrip groupClassName="mt-4">
            <StatStripCell label="SOCIAL In Pools" showDivider>
              <span className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-sm font-bold portal-link md:text-base">
                {!marketLiquidityLoaded ? (
                  <PulsingDots size="sm" className="text-muted-foreground" />
                ) : marketLiquidityPools.length > 0 ? (
                  formatTokenAmount(totalSocialInPools.toString(), 18, 3)
                ) : (
                  <span aria-label="Unavailable">--</span>
                )}
              </span>
            </StatStripCell>
            <StatStripCell label="Tracked Pools" showDivider>
              <span className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-sm font-bold portal-link md:text-base">
                {!marketLiquidityLoaded ? (
                  <PulsingDots size="sm" className="text-muted-foreground" />
                ) : marketLiquidityPools.length > 0 ? (
                  marketLiquidityPools.length.toString()
                ) : (
                  <span aria-label="Unavailable">--</span>
                )}
              </span>
            </StatStripCell>
            <StatStripCell label="Source">
              <span className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-sm font-bold portal-link md:text-base">
                Ref v2
              </span>
            </StatStripCell>
          </StatStrip>

          <div className="mt-8 divide-y divide-fade-section">
            {MARKET_LIQUIDITY_POOLS.map((config) => {
              const pool = marketLiquidityPools.find(
                (entry) => entry.poolId === config.poolId
              );

              return (
                <div key={config.poolId} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="relative h-7 w-9 flex-none">
                            <MiniTokenIcon
                              src={tokenIconSrc}
                              label={tokenSymbol}
                              className="absolute left-0 top-0 z-10 h-5 w-5 scale-105 shadow-sm ring-2 ring-background"
                            />
                            <MiniTokenIcon
                              src={pool?.pairedIcon}
                              label={pool?.pairedSymbol ?? 'Token'}
                              className="absolute left-[16px] top-[8px] z-0 h-5 w-5 shadow-sm ring-2 ring-background"
                            />
                          </div>
                          <p className="truncate text-sm font-semibold leading-none text-foreground">
                            {`${tokenSymbol}-${pool?.pairedSymbol ?? config.label.split('-')[1] ?? 'Token'}`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 leading-none">
                          <span>SOCIAL</span>
                          <span className="font-mono text-foreground/80">
                            {!marketLiquidityLoaded
                              ? '...'
                              : (pool?.socialAmount ?? '--')}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 leading-none">
                          {!marketLiquidityLoaded
                            ? '...'
                            : pool
                              ? `${pool.pairedAmount} ${pool.pairedSymbol}`
                              : '--'}
                        </span>
                        <span className="inline-flex items-center gap-1 leading-none">
                          <span>LP</span>
                          <span className="font-mono text-foreground/80">
                            {!marketLiquidityLoaded
                              ? '...'
                              : (pool?.lpShares ?? '--')}
                          </span>
                        </span>
                      </div>
                    </div>
                    <a
                      href={config.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 whitespace-nowrap text-xs uppercase tracking-[0.16em] portal-link"
                    >
                      Open Pool
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </SurfacePanel>
      </motion.div>

      {/* ── Token Utility ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8"
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="p-5 md:p-8"
        >
          <SectionHeader badge="Utility" />
          <InsetDividerGroup
            contentClassName="divide-y divide-fade-detail"
            showTopDivider
          >
            {TOKEN_UTILITY.map((u) => {
              const content = (
                <>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {u.eyebrow}
                    </p>
                    <div className="mb-1.5 flex items-center gap-2.5">
                      <u.icon
                        className="h-3.5 w-3.5 flex-shrink-0"
                        style={{ color: portalColors[u.accent] }}
                      />
                      <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
                        {u.label}
                      </h3>
                      {u.href ? (
                        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/80" />
                      ) : null}
                    </div>
                    <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
                      {u.desc}
                    </p>
                  </div>
                </>
              );

              if (u.href) {
                return (
                  <Link
                    key={u.label}
                    href={u.href}
                    className="group block py-4.5 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:py-5"
                  >
                    <div className="transition-colors group-hover:text-foreground">
                      {content}
                    </div>
                  </Link>
                );
              }

              return (
                <div
                  key={u.label}
                  className="py-4.5 first:pt-0 last:pb-0 md:py-5"
                >
                  {content}
                </div>
              );
            })}
          </InsetDividerGroup>
        </SurfacePanel>
      </motion.div>
    </PageShell>
  );
}
