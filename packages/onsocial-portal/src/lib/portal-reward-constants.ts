import { walletLabelFromAccountId } from '@/lib/wallet-label';

/** Matches backend portal-rewards REWARD_AMOUNT (0.1 SOCIAL, 18 decimals). */
export const PORTAL_REWARD_CREDIT_YOCTO = 100_000_000_000_000_000n;

/** Matches backend REWARD_MIN_CLAIM default (1.0 SOCIAL). */
export const PORTAL_REWARD_MIN_CLAIM_YOCTO = 1_000_000_000_000_000_000n;

/** Rewards contract app_id for portal credits (backend ONSOCIAL_PORTAL_REWARDS_APP_ID). */
export const PORTAL_REWARDS_APP_ID = 'onsocial_portal';

export type PortalRewardAction =
  | 'profile_created'
  | 'daily_active'
  | 'stand_given'
  | 'mutual_stand_created'
  | 'endorsement_given';

export interface PortalRewardActionRule {
  action: PortalRewardAction;
  label: string;
  shortLabel: string;
  limit: string;
  /** Matches backend ACTION_CONFIG cap for this action. */
  cap: number;
}

/** Portal activity rewards — keep in sync with portal-rewards ACTION_CONFIG caps. */
export const PORTAL_REWARD_ACTION_RULES: PortalRewardActionRule[] = [
  {
    action: 'profile_created',
    label: 'Profile saved',
    shortLabel: 'Profile',
    limit: 'Once ever',
    cap: 1,
  },
  {
    action: 'daily_active',
    label: 'Daily check-in',
    shortLabel: 'Check-in',
    limit: 'Once per day',
    cap: 1,
  },
  {
    action: 'stand_given',
    label: 'Stand sent',
    shortLabel: 'Stand',
    limit: 'Once per account · up to 3/day',
    cap: 3,
  },
  {
    action: 'mutual_stand_created',
    label: 'Mutual stand',
    shortLabel: 'Mutual',
    limit: 'Once per account · up to 3/day',
    cap: 3,
  },
  {
    action: 'endorsement_given',
    label: 'Endorsement',
    shortLabel: 'Endorse',
    limit: 'Once per topic · up to 3/day',
    cap: 3,
  },
];

export interface PortalRewardActionProgressEntry {
  count: number;
  cap: number;
}

export type PortalRewardActionProgress = Record<
  PortalRewardAction,
  PortalRewardActionProgressEntry
>;

export function emptyPortalRewardActionProgress(): PortalRewardActionProgress {
  return PORTAL_REWARD_ACTION_RULES.reduce((acc, rule) => {
    acc[rule.action] = { count: 0, cap: rule.cap };
    return acc;
  }, {} as PortalRewardActionProgress);
}

export function resolvePortalRewardActionProgress(
  progress: PortalRewardActionProgress | null,
  action: PortalRewardAction,
  fallbackCap: number
): PortalRewardActionProgressEntry {
  return (
    progress?.[action] ?? {
      count: 0,
      cap: fallbackCap,
    }
  );
}

/** Sum of per-action counts returned from the activity log (not SOCIAL amounts). */
export function totalPortalRewardActionCount(
  progress: PortalRewardActionProgress | null
): number {
  if (!progress) return 0;
  return PORTAL_REWARD_ACTION_RULES.reduce(
    (sum, rule) => sum + (progress[rule.action]?.count ?? 0),
    0
  );
}

/** Shared claimable-balance hint across portal and Telegram bot. */
export const REWARD_ECOSYSTEM_CLAIM_HINT =
  'Includes rewards from OnSocial apps and partners';

/** Compact wallet-menu hint (full text available via title tooltip). */
export const REWARD_ECOSYSTEM_CLAIM_HINT_COMPACT = 'OnSocial + partners';

/** Wallet menu when balance is zero — broad enough for future reward actions. */
export const PORTAL_REWARD_EMPTY_HINT = 'Earn SOCIAL from platform activity.';

/** Telegram /balance daily bar scope (per-app cap for the linked group bot). */
export const REWARD_TELEGRAM_DAILY_SCOPE_HINT =
  'Daily progress is for this Telegram group only';

export const PORTAL_REWARD_AGGREGATE_MS = 800;

/** Short coalesce before settling a single credit (stand + daily may pair). */
export const PORTAL_REWARD_COALESCE_MS = 80;

export const PORTAL_REWARD_REFRESH_DELAYS_MS = [0, 750, 2_000] as const;

export interface PortalRewardToastContext {
  action: PortalRewardAction;
  targetAccountId?: string | null;
  topic?: string | null;
}

const PORTAL_REWARD_ACTION_LABELS: Record<
  Exclude<PortalRewardAction, 'stand_given' | 'endorsement_given'>,
  string
> = {
  profile_created: 'Profile saved',
  daily_active: 'Daily check-in',
  mutual_stand_created: 'Mutual stand',
};

export function formatPortalRewardToastReason({
  action,
  targetAccountId,
  topic,
}: PortalRewardToastContext): string {
  if (action === 'stand_given') {
    const target = targetAccountId?.trim();
    return target
      ? `Stand · ${walletLabelFromAccountId(target)}`
      : 'Stand sent';
  }

  if (action === 'endorsement_given') {
    const normalizedTopic = topic?.trim();
    return normalizedTopic
      ? `Endorsed · ${normalizedTopic}`
      : 'Endorsement sent';
  }

  if (action === 'mutual_stand_created') {
    const target = targetAccountId?.trim();
    if (target) {
      return `Mutual stand · ${walletLabelFromAccountId(target)}`;
    }
  }

  return PORTAL_REWARD_ACTION_LABELS[action];
}

/** Drop stand_given when mutual_stand is in the same burst — one social line is enough. */
export function compressPortalRewardToastReasons(
  events: PortalRewardToastContext[]
): string[] {
  const hasMutual = events.some(
    (event) => event.action === 'mutual_stand_created'
  );
  const reasons: string[] = [];

  for (const event of events) {
    if (event.action === 'stand_given' && hasMutual) continue;

    const reason = formatPortalRewardToastReason(event);
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }

  return reasons;
}
