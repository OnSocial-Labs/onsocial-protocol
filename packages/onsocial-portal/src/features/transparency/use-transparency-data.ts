'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePortalNetwork } from '@/contexts/portal-network-context';
import { viewContractAtOnNetwork } from '@/lib/near-rpc';
import { resolveFtTokenIcon } from '@/lib/token-metadata';
import type { PortalAccent } from '@/lib/portal-colors';
import {
  MARKET_LIQUIDITY_POOLS,
  RHEA_CONTRACT,
  RHEA_SOCIAL_TOKEN,
} from '@/features/transparency/transparency-constants';
import {
  formatPercent,
  formatSupplyOverviewFromYocto,
  formatTokenAmount,
  formatWholeTokenAmount,
} from '@/features/transparency/transparency-format';
import { fetchFallbackTokenIcon } from '@/features/transparency/transparency-token-icon';

interface TokenMetadataView {
  icon?: string | null;
  decimals?: number;
  symbol?: string;
}

interface RefPoolView {
  amounts: string[];
  shares_total_supply: string;
  token_account_ids: string[];
}

interface RewardsContractInfoView {
  pool_balance: string;
}

interface BoostStatsView {
  total_locked: string;
}

export interface TransparencyDistributionEntry {
  label: string;
  account: string;
  accent: PortalAccent;
  balance: bigint | null;
  balanceDisplay: string;
  pctOfSupplyDisplay: string;
  pctOfSupply: number;
}

export interface TransparencyLiquidityPool {
  href: string;
  lpShares: string;
  pairedAmount: string;
  pairedIcon: string | null;
  pairedSymbol: string;
  poolId: number;
  socialAmount: string;
  socialAmountRaw: bigint;
  label: string;
}

export function useTransparencyData() {
  const { profile } = usePortalNetwork();
  const network = profile.network;
  const tokenContract = profile.contracts.token;
  const rewardsContract = profile.contracts.rewards;
  const boostContract = profile.contracts.boost;
  const apiUrl = profile.apiUrl;
  const allocationAccounts = useMemo(
    () => [
      {
        label: 'Reward Pool',
        account: profile.contracts.rewards,
        accent: 'purple' as const,
      },
      {
        label: 'Treasury',
        account: profile.contracts.treasury,
        accent: 'blue' as const,
      },
      {
        label: 'Influence Pool',
        account: profile.contracts.boost,
        accent: 'green' as const,
      },
      {
        label: 'Founder Vesting',
        account: profile.contracts.vesting,
        accent: 'gold' as const,
      },
    ],
    [profile]
  );
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState('SOCIAL');
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
    TransparencyLiquidityPool[]
  >([]);
  const [marketLiquidityLoaded, setMarketLiquidityLoaded] = useState(
    network !== 'mainnet'
  );
  const [totalLockedYocto, setTotalLockedYocto] = useState('0');
  const [boostStatsLoaded, setBoostStatsLoaded] = useState(false);

  useEffect(() => {
    viewContractAtOnNetwork<TokenMetadataView>(
      network,
      tokenContract,
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
      network,
      tokenContract,
      'ft_total_supply',
      {}
    )
      .then((totalSupply) => {
        if (totalSupply) {
          const supplyYocto = BigInt(totalSupply);
          const { supplyDisplay, burnedDisplay: burned } =
            formatSupplyOverviewFromYocto(supplyYocto);

          setCurrentSupplyYocto(supplyYocto);
          setCurrentSupplyDisplay(supplyDisplay);
          setBurnedDisplay(burned);
        }
      })
      .catch(() => {})
      .finally(() => setSupplyLoaded(true));

    fetch(`${apiUrl}/graph/token-stats`, {
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
      allocationAccounts.map(async ({ account }) => {
        if (account === rewardsContract) {
          return [account, null] as const;
        }

        const balance = await viewContractAtOnNetwork<string>(
          network,
          tokenContract,
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
      network,
      rewardsContract,
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

    viewContractAtOnNetwork<BoostStatsView>(
      network,
      boostContract,
      'get_stats',
      {}
    )
      .then((stats) => {
        if (stats?.total_locked) {
          setTotalLockedYocto(stats.total_locked);
        }
      })
      .catch(() => {})
      .finally(() => setBoostStatsLoaded(true));

    if (network === 'mainnet') {
      Promise.all(
        MARKET_LIQUIDITY_POOLS.map(async ({ href, poolId, label }) => {
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
            resolveFtTokenIcon(pairedTokenId, pairedMetadata?.icon) ??
            (await fetchFallbackTokenIcon(pairedTokenId));

          return {
            href,
            label,
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
          } satisfies TransparencyLiquidityPool;
        })
      )
        .then((pools) => {
          setMarketLiquidityPools(
            pools.filter((pool) => pool !== null) as TransparencyLiquidityPool[]
          );
        })
        .catch(() => {})
        .finally(() => setMarketLiquidityLoaded(true));
    }
  }, [
    allocationAccounts,
    apiUrl,
    boostContract,
    network,
    rewardsContract,
    tokenContract,
  ]);

  const getTrackedBalance = (account: string): bigint | null =>
    account === rewardsContract
      ? rewardsPoolBalance
      : (liveAccountBalances[account] ?? null);

  const liveDistribution = useMemo((): TransparencyDistributionEntry[] => {
    return allocationAccounts.map((item) => {
      const balance = getTrackedBalance(item.account);
      const pctOfSupply =
        balance !== null &&
        currentSupplyYocto !== null &&
        currentSupplyYocto > 0n
          ? Number((balance * 10000n) / currentSupplyYocto) / 100
          : 0;

      return {
        ...item,
        balance,
        balanceDisplay:
          balance !== null ? formatWholeTokenAmount(balance.toString()) : '—',
        pctOfSupplyDisplay:
          balance !== null &&
          currentSupplyYocto !== null &&
          currentSupplyYocto > 0n
            ? formatPercent(balance, currentSupplyYocto)
            : '0.0',
        pctOfSupply,
      };
    });
  }, [
    allocationAccounts,
    currentSupplyYocto,
    liveAccountBalances,
    rewardsContract,
    rewardsPoolBalance,
  ]);

  const liveTrackedTotal = useMemo(
    () =>
      allocationAccounts.reduce((total, item) => {
        const balance = getTrackedBalance(item.account);
        return total + (balance ?? 0n);
      }, 0n),
    [
      allocationAccounts,
      liveAccountBalances,
      rewardsContract,
      rewardsPoolBalance,
    ]
  );

  const untrackedBalance =
    currentSupplyYocto !== null && currentSupplyYocto > liveTrackedTotal
      ? currentSupplyYocto - liveTrackedTotal
      : 0n;

  const barDistribution = useMemo((): TransparencyDistributionEntry[] => {
    return [
      ...liveDistribution,
      {
        label: 'Other Holders',
        account: 'other-holders',
        accent: 'neutral' as PortalAccent,
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
  }, [currentSupplyYocto, liveDistribution, untrackedBalance]);

  const totalSocialInPools = marketLiquidityPools.reduce(
    (total, pool) => total + pool.socialAmountRaw,
    0n
  );

  const allocationLoaded =
    supplyLoaded && liveAccountBalancesLoaded && rewardsPoolBalanceLoaded;

  return {
    tokenIconSrc,
    setTokenIconSrc,
    tokenSymbol,
    holderCount,
    holderCountLoaded,
    currentSupplyDisplay,
    burnedDisplay,
    supplyLoaded,
    liveDistribution,
    barDistribution,
    rewardsPoolBalanceLoaded,
    liveAccountBalancesLoaded,
    allocationLoaded,
    marketLiquidityPools,
    marketLiquidityLoaded,
    totalSocialInPools,
    totalLockedYocto,
    boostStatsLoaded,
  };
}
