import type {
  PlatformRewardAction,
  PlatformRewardCreditEvent,
} from '@onsocial/sdk';
import { displayName } from '@/lib/profile-display';

/** Window to merge nearby credits into one burst (stand + daily + mutual). */
export const APP_REWARD_BURST_AGGREGATE_MS = 800;

/** Stand may trigger stand, daily, and mutual credits over staggered API responses. */
export const APP_REWARD_BURST_STAND_BATCH_MS = 1_500;

const SOCIAL_STAND_BATCH_ACTIONS = new Set<PlatformRewardAction>([
  'stand_given',
  'daily_active',
  'mutual_stand_created',
]);

export function resolveBurstAggregateDelayMs(
  events: AppRewardBurstContext[]
): number {
  if (events.some((event) => SOCIAL_STAND_BATCH_ACTIONS.has(event.action))) {
    return APP_REWARD_BURST_STAND_BATCH_MS;
  }

  return APP_REWARD_BURST_AGGREGATE_MS;
}

export function isSocialStandBatchAction(
  action: PlatformRewardAction
): boolean {
  return SOCIAL_STAND_BATCH_ACTIONS.has(action);
}

export interface AppRewardBurstContext {
  action: PlatformRewardAction;
  targetAccountId?: string | null;
  targetDisplayName?: string | null;
  topic?: string | null;
}

function resolveBurstTargetLabel(
  accountId: string,
  targetDisplayName?: string | null
): string {
  return displayName(accountId, targetDisplayName ?? undefined);
}

const APP_REWARD_BURST_ACTION_LABELS: Record<
  Exclude<PlatformRewardAction, 'stand_given' | 'endorsement_given'>,
  string
> = {
  profile_created: 'Profile saved',
  daily_active: 'Daily check-in',
  mutual_stand_created: 'Mutual stand',
};

export function formatAppRewardBurstReason({
  action,
  targetAccountId,
  targetDisplayName,
  topic,
}: AppRewardBurstContext): string {
  if (action === 'stand_given') {
    const target = targetAccountId?.trim();
    return target
      ? `Stand · ${resolveBurstTargetLabel(target, targetDisplayName)}`
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
      return `Mutual stand · ${resolveBurstTargetLabel(target, targetDisplayName)}`;
    }
  }

  return APP_REWARD_BURST_ACTION_LABELS[action];
}

function parseCreditAmountYocto(amountYocto: string): bigint {
  try {
    return BigInt(amountYocto);
  } catch {
    return 0n;
  }
}

/** Stable key so we never celebrate the same credited batch twice. */
export function buildBurstFlushSignature(
  events: PlatformRewardCreditEvent[]
): string {
  return events
    .map(
      (event) =>
        `${event.action}:${event.amountYocto}:${event.targetAccountId ?? ''}:${event.topic ?? ''}`
    )
    .join('|');
}

/** Full credited total for the pill — matches what landed on-chain in this batch. */
export function resolveBurstDisplayAmount(
  events: PlatformRewardCreditEvent[]
): bigint {
  return events.reduce(
    (sum, event) => sum + parseCreditAmountYocto(event.amountYocto),
    0n
  );
}

/** Celebrate any positive credit, including a lone daily check-in (once per day). */
export function shouldShowBurstCelebration(
  events: PlatformRewardCreditEvent[]
): boolean {
  return resolveBurstDisplayAmount(events) > 0n;
}

/** Drop stand_given when mutual_stand is in the same burst — one social line is enough. */
export function compressAppRewardBurstReasons(
  events: AppRewardBurstContext[]
): string[] {
  const hasMutual = events.some(
    (event) => event.action === 'mutual_stand_created'
  );
  const reasons: string[] = [];

  for (const event of events) {
    if (event.action === 'stand_given' && hasMutual) continue;

    const reason = formatAppRewardBurstReason(event);
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }

  return reasons;
}

const SHORT_BURST_REASON_MAX = 36;

/** One line for the celebration pill — joined reasons, trimmed. */
export function formatShortBurstReason(reasons: string[]): string | null {
  const trimmed = reasons.map((reason) => reason.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return null;
  }

  const line = trimmed.join(' · ');
  if (line.length <= SHORT_BURST_REASON_MAX) {
    return line;
  }

  return `${line.slice(0, SHORT_BURST_REASON_MAX - 1)}…`;
}
