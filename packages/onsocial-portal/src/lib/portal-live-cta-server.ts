import { BOOST_EVENT_TYPES } from '@onsocial/sdk';
import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  BOOST_CONTRACT,
  REWARDS_CONTRACT,
  viewContractAt,
  type BoostStats,
} from '@/lib/near-rpc';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export interface LiveCtaBoostNetwork {
  totalLocked: string;
  scheduledPool: string;
  totalRewardsReleased: string;
}

export interface LiveCtaRewardsNetwork {
  totalCredited: string;
  poolBalance: string;
  appCount: number;
}

export interface LiveCtaPersonalRewards {
  totalEarned: string;
  totalClaimed: string;
  claimable: string;
  topRewardApp: {
    label: string;
    totalEarned: string;
  } | null;
}

export interface LiveCtaPayload {
  boost: LiveCtaBoostNetwork | null;
  rewards: LiveCtaRewardsNetwork | null;
  personal: LiveCtaPersonalRewards | null;
}

function yoctoString(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return '0';
}

function readAggregateSum(
  node:
    | { aggregate?: { sum?: { lockedAmount?: string | null } | null } | null }
    | null
    | undefined
): string | null {
  const raw = node?.aggregate?.sum?.lockedAmount;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function readRewardsAmountSum(
  node:
    | { aggregate?: { sum?: { amount?: string | null } | null } | null }
    | null
    | undefined
): string | null {
  const raw = node?.aggregate?.sum?.amount;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function readDistinctCount(
  node: { aggregate?: { count?: number | null } | null } | null | undefined
): number {
  const count = node?.aggregate?.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

async function loadBoostNetworkFromIndexer(
  os: PortalOnSocial
): Promise<LiveCtaBoostNetwork | null> {
  const [lockedAgg, releaseEvents] = await Promise.all([
    os.query.graphql<{
      boosterStateAggregate: {
        aggregate?: { sum?: { lockedAmount?: string | null } | null } | null;
      };
    }>({
      query: `query BoostLockedTotal {
        boosterStateAggregate {
          aggregate { sum { lockedAmount } }
        }
      }`,
    }),
    os.query.boost.events({
      eventType: BOOST_EVENT_TYPES.REWARDS_RELEASED,
      success: true,
      limit: 1,
    }),
  ]);

  const totalLocked = readAggregateSum(lockedAgg.data?.boosterStateAggregate);
  const latestRelease = releaseEvents[0];
  if (!totalLocked && !latestRelease) return null;

  return {
    totalLocked: totalLocked ?? '0',
    scheduledPool: yoctoString(latestRelease?.remainingPool),
    totalRewardsReleased: yoctoString(latestRelease?.totalReleased),
  };
}

async function loadBoostNetworkFromRpc(): Promise<LiveCtaBoostNetwork | null> {
  const stats = await viewContractAt<BoostStats>(
    BOOST_CONTRACT,
    'get_stats',
    {}
  );
  if (!stats) return null;

  return {
    totalLocked: yoctoString(stats.total_locked),
    scheduledPool: yoctoString(stats.scheduled_pool),
    totalRewardsReleased: yoctoString(stats.total_rewards_released),
  };
}

async function loadBoostNetwork(
  os: PortalOnSocial
): Promise<LiveCtaBoostNetwork | null> {
  try {
    const indexed = await loadBoostNetworkFromIndexer(os);
    if (indexed) return indexed;
  } catch {
    // Fall back to a single contract read on the server.
  }

  try {
    return await loadBoostNetworkFromRpc();
  } catch {
    return null;
  }
}

async function loadRewardsNetworkFromIndexer(
  os: PortalOnSocial
): Promise<Pick<LiveCtaRewardsNetwork, 'totalCredited' | 'appCount'> | null> {
  const res = await os.query.graphql<{
    credited: {
      aggregate?: { sum?: { amount?: string | null } | null } | null;
    };
    apps: { aggregate?: { count?: number | null } | null };
  }>({
    query: `query RewardsNetworkIndexed {
      credited: rewardsEventsAggregate(
        where: { eventType: {_eq: "REWARD_CREDITED"}, success: {_eq: true}}
      ) {
        aggregate { sum { amount } }
      }
      apps: rewardsEventsAggregate(
        where: {
          eventType: {_eq: "REWARD_CREDITED"},
          success: {_eq: true},
          appId: {_isNull: false}
        }
      ) {
        aggregate { count(columns: appId, distinct: true) }
      }
    }`,
  });

  const totalCredited = readRewardsAmountSum(res.data?.credited);
  const appCount = readDistinctCount(res.data?.apps);
  if (!totalCredited && appCount === 0) return null;

  return {
    totalCredited: totalCredited ?? '0',
    appCount,
  };
}

async function loadRewardsNetwork(
  os: PortalOnSocial
): Promise<LiveCtaRewardsNetwork | null> {
  const [indexed, contractInfo] = await Promise.all([
    loadRewardsNetworkFromIndexer(os).catch(() => null),
    viewContractAt<{
      pool_balance?: string;
      total_credited?: string;
      app_ids?: string[];
    }>(REWARDS_CONTRACT, 'get_contract_info', {}).catch(() => null),
  ]);

  if (!indexed && !contractInfo) return null;

  return {
    totalCredited:
      indexed?.totalCredited ?? yoctoString(contractInfo?.total_credited),
    poolBalance: yoctoString(contractInfo?.pool_balance),
    appCount: indexed?.appCount ?? contractInfo?.app_ids?.length ?? 0,
  };
}

function aggregateTopRewardApp(
  credits: Array<{ appId: string | null; amount: string | null }>
): { appId: string; totalEarned: bigint } | null {
  const totals = new Map<string, bigint>();

  for (const credit of credits) {
    const appId = credit.appId?.trim();
    if (!appId) continue;

    let amount = 0n;
    try {
      amount = BigInt(credit.amount ?? '0');
    } catch {
      amount = 0n;
    }
    if (amount <= 0n) continue;

    totals.set(appId, (totals.get(appId) ?? 0n) + amount);
  }

  let winner: { appId: string; totalEarned: bigint } | null = null;
  for (const [appId, totalEarned] of totals) {
    if (
      !winner ||
      totalEarned > winner.totalEarned ||
      (totalEarned === winner.totalEarned &&
        appId.localeCompare(winner.appId) < 0)
    ) {
      winner = { appId, totalEarned };
    }
  }

  return winner;
}

async function resolveAppLabel(appId: string): Promise<string> {
  try {
    const config = await viewContractAt<{ label?: string }>(
      REWARDS_CONTRACT,
      'get_app_config',
      { app_id: appId }
    );
    return config?.label?.trim() || appId;
  } catch {
    return appId;
  }
}

export async function loadPersonalRewards(
  os: PortalOnSocial,
  accountId: string
): Promise<LiveCtaPersonalRewards | null> {
  const [userState, overview, credits] = await Promise.all([
    os.query.rewards.userState(accountId).catch(() => null),
    viewContractAt<{
      claimable?: string;
      total_earned?: string;
      total_claimed?: string;
    }>(REWARDS_CONTRACT, 'get_user_rewards_overview', {
      account_id: accountId,
    }).catch(() => null),
    os.query.rewards
      .creditsTo(accountId, { limit: 300 })
      .catch(
        () => [] as Array<{ appId: string | null; amount: string | null }>
      ),
  ]);

  if (!userState && !overview) return null;

  const top = aggregateTopRewardApp(credits);
  const topRewardApp = top
    ? {
        label: await resolveAppLabel(top.appId),
        totalEarned: top.totalEarned.toString(),
      }
    : null;

  return {
    totalEarned:
      yoctoString(overview?.total_earned) ||
      yoctoString(userState?.totalEarned) ||
      '0',
    totalClaimed:
      yoctoString(overview?.total_claimed) ||
      yoctoString(userState?.totalClaimed) ||
      '0',
    claimable: yoctoString(overview?.claimable),
    topRewardApp,
  };
}

export async function loadLiveCtaPayload(
  os: PortalOnSocial,
  accountId: string | null
): Promise<LiveCtaPayload> {
  const [boost, rewards, personal] = await Promise.all([
    loadBoostNetwork(os),
    loadRewardsNetwork(os),
    accountId ? loadPersonalRewards(os, accountId) : Promise.resolve(null),
  ]);

  return { boost, rewards, personal };
}
