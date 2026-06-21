'use client';

import { useEffect, useMemo, useState } from 'react';
import { viewContractAtOnNetwork } from '@/lib/near-rpc';
import { resolveFtTokenIcon } from '@/lib/token-metadata';
import type { PortalAccent } from '@/lib/portal-colors';
import {
  LIVE_ALLOCATION_ACCOUNTS,
  MARKET_LIQUIDITY_POOLS,
  RHEA_CONTRACT,
  RHEA_SOCIAL_TOKEN,
  TRANSPARENCY_API_URL,
  TRANSPARENCY_BOOST_CONTRACT,
  TRANSPARENCY_NETWORK,
  TRANSPARENCY_REWARDS_CONTRACT,
  TRANSPARENCY_TOKEN_CONTRACT,
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
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState('SOCIAL');
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [holderCountLoaded, setHolderCountLoaded] = useState(false);
  const [currentSupplyDisplay, setCurrentSupplyDisplay] = useState<string | null>(
    null
  );
  const [currentSupplyYocto, setCurrentSupplyYocto] = useState<bigint | null>(null);
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
    TRANSPARENCY_NETWORK !== 'mainnet'
  );
  const [totalLockedYocto, setTotalLockedYocto] = useState('0');
  const [boostStatsLoaded, setBoostStatsLoaded] = useState(false);

  useEffect(() => {
    viewContractAtOnNetwork<TokenMetadataView>(
      TRANSPARENCY_NETWORK,
      TRANSPARENCY_TOKEN_CONTRACT,
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
      TRANSPARENCY_NETWORK,
      TRANSPARENCY_TOKEN_CONTRACT,
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

    fetch(`${TRANSPARENCY_API_URL}/graph/token-stats`, {
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
        if (account === TRANSPARENCY_REWARDS_CONTRACT) {
          return [account, null] as const;
        }

        const balance = await viewContractAtOnNetwork<string>(
          TRANSPARENCY_NETWORK,
          TRANSPARENCY_TOKEN_CONTRACT,
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
      TRANSPARENCY_NETWORK,
      TRANSPARENCY_REWARDS_CONTRACT,
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
      TRANSPARENCY_NETWORK,
      TRANSPARENCY_BOOST_CONTRACT,
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

    if (TRANSPARENCY_NETWORK === 'mainnet') {
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
  }, []);

  const getTrackedBalance = (account: string): bigint | null =>
    account === TRANSPARENCY_REWARDS_CONTRACT
      ? rewardsPoolBalance
      : (liveAccountBalances[account] ?? null);

  const isTrackedBalanceLoaded = (account: string): boolean =>
    account === TRANSPARENCY_REWARDS_CONTRACT
      ? rewardsPoolBalanceLoaded
      : liveAccountBalancesLoaded;

  const liveDistribution = useMemo((): TransparencyDistributionEntry[] => {
    return LIVE_ALLOCATION_ACCOUNTS.map((item) => {
      const balance = getTrackedBalance(item.account);
      const pctOfSupply =
        balance !== null && currentSupplyYocto !== null && currentSupplyYocto > 0n
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
    currentSupplyYocto,
    liveAccountBalances,
    rewardsPoolBalance,
  ]);

  const liveTrackedTotal = useMemo(
    () =>
      LIVE_ALLOCATION_ACCOUNTS.reduce((total, item) => {
        const balance = getTrackedBalance(item.account);
        return total + (balance ?? 0n);
      }, 0n),
    [liveAccountBalances, rewardsPoolBalance]
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
    isTrackedBalanceLoaded,
    allocationLoaded,
    marketLiquidityPools,
    marketLiquidityLoaded,
    totalSocialInPools,
    totalLockedYocto,
    boostStatsLoaded,
  };
}
