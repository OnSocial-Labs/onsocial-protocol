import { PORTAL_REWARDS_APP_ID } from '@/lib/portal-reward-constants';
import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  REWARDS_CONTRACT,
  viewContractAt,
  type RewardsUserRewardsOverviewView,
} from '@/lib/near-rpc';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

function yoctoString(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return '0';
}

export async function loadPortalRewardsOverview(
  os: PortalOnSocial,
  accountId: string
): Promise<RewardsUserRewardsOverviewView | null> {
  const [overview, userState] = await Promise.all([
    viewContractAt<RewardsUserRewardsOverviewView>(
      REWARDS_CONTRACT,
      'get_user_rewards_overview',
      { account_id: accountId, app_id: PORTAL_REWARDS_APP_ID }
    ).catch(() => null),
    os.query.rewards.userState(accountId).catch(() => null),
  ]);

  if (!overview && !userState) return null;

  if (!overview) {
    return {
      claimable: '0',
      total_earned: yoctoString(userState?.totalEarned),
      total_claimed: yoctoString(userState?.totalClaimed),
      global_daily_earned: '0',
      global_daily_remaining: '0',
      app: null,
    };
  }

  return {
    ...overview,
    total_earned:
      yoctoString(overview.total_earned) ||
      yoctoString(userState?.totalEarned) ||
      '0',
    total_claimed:
      yoctoString(overview.total_claimed) ||
      yoctoString(userState?.totalClaimed) ||
      '0',
  };
}
