import { estimatePortalRewardActionProgressFromDailyCredits } from '@/lib/portal-reward-action-ledger';
import { loadPortalRewardActionProgress } from '@/lib/portal-reward-progress-server';
import { loadPortalRewardsOverview } from '@/lib/portal-rewards-overview-server';
import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  emptyPortalRewardActionProgress,
  type PortalRewardActionProgress,
} from '@/lib/portal-reward-constants';
import type { RewardsUserRewardsOverviewView } from '@/lib/near-rpc';

function parseDailyEarnedYocto(
  overview: RewardsUserRewardsOverviewView | null
): bigint {
  try {
    return BigInt(overview?.app?.daily_earned ?? '0');
  } catch {
    return 0n;
  }
}

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export interface PortalRewardsState {
  overview: RewardsUserRewardsOverviewView | null;
  actions: PortalRewardActionProgress;
  actionsAvailable: boolean;
}

export async function loadPortalRewardsState(
  os: PortalOnSocial,
  accountId: string
): Promise<PortalRewardsState> {
  const [overview, actionsResult] = await Promise.all([
    loadPortalRewardsOverview(os, accountId),
    loadPortalRewardActionProgress(accountId),
  ]);

  const rawActions = actionsResult ?? emptyPortalRewardActionProgress();
  const dailyEarnedYocto = parseDailyEarnedYocto(overview);
  const actions = estimatePortalRewardActionProgressFromDailyCredits(
    rawActions,
    dailyEarnedYocto
  );

  return {
    overview,
    actions,
    actionsAvailable: true,
  };
}
