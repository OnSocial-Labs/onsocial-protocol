/** Matches backend REWARD_MIN_CLAIM default (1.0 SOCIAL). */
export const APP_REWARD_MIN_CLAIM_YOCTO = 1_000_000_000_000_000_000n;

export const APP_SOCIAL_WALLET_ARIA_LABEL = 'Your SOCIAL';

export const APP_SOCIAL_EMPTY_HINT =
  'Show up — stands, saves, and posts build SOCIAL.';

/** Compact row label beside the collect progress bar. */
export const APP_ACTIVITY_METRIC_LABEL = 'Activity';

export const APP_COLLECT_ACTION_LABEL = 'Collect';

export const APP_COLLECT_SUCCEEDED_ACTION_LABEL = 'Collected';

export const APP_COLLECT_READY_BADGE = 'Now';

export const APP_SOCIAL_HELP_TITLE = 'How SOCIAL works';

export const APP_SOCIAL_CREDIT_LABEL = '0.1 SOCIAL';

export const APP_SOCIAL_HELP_SUMMARY = `${APP_SOCIAL_CREDIT_LABEL} when you stand, save, or show up · collect at 1 SOCIAL`;

export const APP_SOCIAL_HELP_DETAIL =
  'SOCIAL stacks from what you do on your page and across OnSocial. When you hit 1 SOCIAL, tap Collect and it’s yours.';

export const APP_REWARD_REFRESH_DELAYS_MS = [0, 750, 2_000] as const;

/** @deprecated Use APP_SOCIAL_EMPTY_HINT */
export const APP_REWARD_EMPTY_HINT = APP_SOCIAL_EMPTY_HINT;

/** @deprecated Use APP_ACTIVITY_METRIC_LABEL */
export const APP_REWARD_METRIC_LABEL = APP_ACTIVITY_METRIC_LABEL;

/** @deprecated Use APP_SOCIAL_CREDIT_LABEL */
export const APP_REWARD_CREDIT_LABEL = APP_SOCIAL_CREDIT_LABEL;

/** @deprecated Use APP_SOCIAL_HELP_SUMMARY */
export const APP_REWARD_RULES_SUMMARY = APP_SOCIAL_HELP_SUMMARY;

/** @deprecated Use APP_SOCIAL_HELP_DETAIL */
export const APP_REWARD_RULES_DETAIL = APP_SOCIAL_HELP_DETAIL;
