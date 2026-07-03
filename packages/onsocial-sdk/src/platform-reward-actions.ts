/** Platform activity rewards — shared by Portal and OnPage surfaces. */
export const PLATFORM_REWARD_ACTIONS = [
  'profile_created',
  'daily_active',
  'stand_given',
  'mutual_stand_created',
  'endorsement_given',
] as const;

export type PlatformRewardAction = (typeof PLATFORM_REWARD_ACTIONS)[number];

export type SocialPlatformRewardAction = Exclude<
  PlatformRewardAction,
  'daily_active'
>;

export const PLATFORM_REWARD_ACTIONS_SET = new Set<string>(
  PLATFORM_REWARD_ACTIONS
);

export function isPlatformRewardAction(
  value: unknown
): value is PlatformRewardAction {
  return typeof value === 'string' && PLATFORM_REWARD_ACTIONS_SET.has(value);
}
