import { walletLabelFromAccountId } from '@/lib/wallet-label';

/** Matches backend portal-rewards REWARD_AMOUNT (0.1 SOCIAL, 18 decimals). */
export const PORTAL_REWARD_CREDIT_YOCTO = 100_000_000_000_000_000n;

/** Matches backend REWARD_MIN_CLAIM default (1.0 SOCIAL). */
export const PORTAL_REWARD_MIN_CLAIM_YOCTO = 1_000_000_000_000_000_000n;

export interface PortalRewardActionRule {
  label: string;
  limit: string;
}

/** Portal activity rewards — keep in sync with portal-rewards ACTION_CONFIG caps. */
export const PORTAL_REWARD_ACTION_RULES: PortalRewardActionRule[] = [
  { label: 'Profile saved', limit: 'Once ever' },
  { label: 'Daily check-in', limit: 'Once per day' },
  { label: 'Stand sent', limit: 'Up to 3 per day' },
  { label: 'Mutual stand', limit: 'Up to 3 per day' },
  { label: 'Endorsement', limit: 'Up to 3 per topic per day' },
];

/** Shared claimable-balance hint across portal and Telegram bot. */
export const REWARD_ECOSYSTEM_CLAIM_HINT =
  'Includes rewards from OnSocial apps and partners';

/** Compact wallet-menu hint (full text available via title tooltip). */
export const REWARD_ECOSYSTEM_CLAIM_HINT_COMPACT = 'OnSocial + partners';

/** Telegram /balance daily bar scope (per-app cap for the linked group bot). */
export const REWARD_TELEGRAM_DAILY_SCOPE_HINT =
  'Daily progress is for this Telegram group only';

export const PORTAL_REWARD_AGGREGATE_MS = 800;

/** Delays for re-reading on-chain claimable after a credit lands. */
export const PORTAL_REWARD_REFRESH_DELAYS_MS = [0, 750, 2_000] as const;

export type PortalRewardAction =
  | 'profile_created'
  | 'daily_active'
  | 'stand_given'
  | 'mutual_stand_created'
  | 'endorsement_given';

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
