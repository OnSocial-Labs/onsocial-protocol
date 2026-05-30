export const ACTION_CONFIG = {
  profile_created: { cap: 1, scope: 'once' },
  daily_active: { cap: 1, scope: 'daily' },
  /** Once per target account — unstand/re-stand cannot re-earn. */
  stand_given: { cap: 3, scope: 'target_once' },
  mutual_stand_created: { cap: 3, scope: 'target_once' },
  /** Once per target + topic — re-endorse after remove cannot re-earn. */
  endorsement_given: { cap: 3, scope: 'target_topic_once' },
} as const;

export type PortalRewardAction = keyof typeof ACTION_CONFIG;

export function isPortalRewardAction(
  value: unknown
): value is PortalRewardAction {
  return typeof value === 'string' && value in ACTION_CONFIG;
}

export function buildIdempotencyKey({
  action,
  accountId,
  appId,
  rewardDay,
  targetAccountId,
  topic,
}: {
  action: PortalRewardAction;
  accountId: string;
  appId: string;
  rewardDay: string;
  targetAccountId: string | null;
  topic: string | null;
}): string {
  const cfg = ACTION_CONFIG[action];
  if (cfg.scope === 'once') return `${appId}:${accountId}:${action}`;
  if (cfg.scope === 'daily')
    return `${appId}:${accountId}:${rewardDay}:${action}`;
  if (cfg.scope === 'target_once') {
    return `${appId}:${accountId}:${action}:${targetAccountId ?? ''}`;
  }
  return `${appId}:${accountId}:${action}:${targetAccountId ?? ''}:${topic ?? ''}`;
}

export function requiresTargetAccount(action: PortalRewardAction): boolean {
  const scope = ACTION_CONFIG[action].scope;
  return scope === 'target_once' || scope === 'target_topic_once';
}

export function requiresTopic(action: PortalRewardAction): boolean {
  return ACTION_CONFIG[action].scope === 'target_topic_once';
}
