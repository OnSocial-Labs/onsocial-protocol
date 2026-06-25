import {
  PORTAL_REWARD_ACTION_RULES,
  PORTAL_REWARD_CREDIT_YOCTO,
  emptyPortalRewardActionProgress,
  totalPortalRewardActionCount,
  type PortalRewardAction,
  type PortalRewardActionProgress,
} from '@/lib/portal-reward-constants';

export { totalPortalRewardActionCount };

/** After a confirmed portal credit, bump the action the backend just gated. */
export function confirmPortalRewardActionCredit(
  progress: PortalRewardActionProgress,
  action: PortalRewardAction
): PortalRewardActionProgress {
  const entry = progress[action];
  if (!entry || entry.count >= entry.cap) {
    return progress;
  }

  return {
    ...progress,
    [action]: {
      ...entry,
      count: Math.min(entry.count + 1, entry.cap),
    },
  };
}

/** Keep the higher per-action count until the activity log catches up. */
export function reconcilePortalRewardActionProgress(
  local: PortalRewardActionProgress,
  api: PortalRewardActionProgress
): PortalRewardActionProgress {
  const next = emptyPortalRewardActionProgress();
  for (const rule of PORTAL_REWARD_ACTION_RULES) {
    const action = rule.action;
    next[action] = {
      cap: api[action].cap,
      count: Math.max(local[action].count, api[action].count),
    };
  }
  return next;
}

/**
 * When chain shows portal credits today but the activity log is empty
 * (legacy credits / log lag), distribute today's credit count across caps.
 */
export function estimatePortalRewardActionProgressFromDailyCredits(
  progress: PortalRewardActionProgress,
  dailyEarnedYocto: bigint
): PortalRewardActionProgress {
  if (totalPortalRewardActionCount(progress) > 0) {
    return progress;
  }

  let remaining = Number(dailyEarnedYocto / PORTAL_REWARD_CREDIT_YOCTO);
  if (remaining <= 0 || !Number.isFinite(remaining)) {
    return progress;
  }

  const next = emptyPortalRewardActionProgress();
  for (const rule of PORTAL_REWARD_ACTION_RULES) {
    next[rule.action].cap = progress[rule.action].cap;
  }

  const fill = (action: PortalRewardAction, cap: number) => {
    if (remaining <= 0 || cap <= 0) return;
    const add = Math.min(cap, remaining);
    next[action].count = add;
    remaining -= add;
  };

  fill('daily_active', next.daily_active.cap);
  fill('stand_given', next.stand_given.cap);
  fill('mutual_stand_created', next.mutual_stand_created.cap);
  fill('endorsement_given', next.endorsement_given.cap);

  return next;
}
