import { query } from '../db/index.js';
import {
  ACTION_CONFIG,
  isPortalRewardAction,
  type PortalRewardAction,
} from './portal-reward-policy.js';

export interface PortalRewardActionProgressEntry {
  count: number;
  cap: number;
}

export type PortalRewardActionProgress = Record<
  PortalRewardAction,
  PortalRewardActionProgressEntry
>;

export function emptyPortalRewardActionProgress(): PortalRewardActionProgress {
  return (Object.keys(ACTION_CONFIG) as PortalRewardAction[]).reduce(
    (acc, action) => {
      acc[action] = { count: 0, cap: ACTION_CONFIG[action].cap };
      return acc;
    },
    {} as PortalRewardActionProgress
  );
}

export async function loadPortalRewardActionProgress({
  accountId,
  appId,
  rewardDay,
}: {
  accountId: string;
  appId: string;
  rewardDay: string;
}): Promise<PortalRewardActionProgress> {
  const progress = emptyPortalRewardActionProgress();

  const [dailyRows, profileRow] = await Promise.all([
    query<{ action: string; count: string }>(
      `SELECT action, count(*)::text AS count
       FROM portal_reward_events
       WHERE app_id = $1
         AND account_id = $2
         AND reward_day = $3::date
         AND status = 'credited'
         AND action <> 'profile_created'
       GROUP BY action`,
      [appId, accountId, rewardDay]
    ),
    query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM portal_reward_events
       WHERE app_id = $1
         AND account_id = $2
         AND action = 'profile_created'
         AND status = 'credited'`,
      [appId, accountId]
    ),
  ]);

  for (const row of dailyRows.rows) {
    if (!isPortalRewardAction(row.action)) continue;
    const cap = ACTION_CONFIG[row.action].cap;
    const count = Number(row.count ?? 0);
    progress[row.action] = {
      count: Math.min(Number.isFinite(count) ? count : 0, cap),
      cap,
    };
  }

  const profileCount = Number(profileRow.rows[0]?.count ?? 0);
  progress.profile_created = {
    count: Math.min(
      Number.isFinite(profileCount) ? profileCount : 0,
      ACTION_CONFIG.profile_created.cap
    ),
    cap: ACTION_CONFIG.profile_created.cap,
  };

  return progress;
}
