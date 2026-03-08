/** Configuration for the OnSocial Rewards SDK. */
export interface OnSocialRewardsConfig {
  /** Relayer API key (issued when your app is registered). */
  apiKey: string;

  /** Your registered app ID (e.g. "partner_telegram"). */
  appId: string;

  /** Relayer base URL. Defaults to https://api.onsocial.id */
  baseUrl?: string;

  /** NEAR rewards contract account. Defaults to rewards.onsocial.near */
  rewardsContract?: string;

  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}

// ── Request types ──

export interface CreditRequest {
  /** NEAR account to credit (e.g. "alice.near"). */
  accountId: string;

  /** Action label for tracking (e.g. "message", "quest_complete"). */
  source: string;

  /** Override the per-action amount in yocto-SOCIAL. Uses the on-chain default if omitted. */
  amount?: string;
}

// ── Response types ──

export interface ExecuteResponse {
  success: boolean;
  status?: 'pending' | 'success' | 'failure';
  tx_hash?: string;
  result?: unknown;
  error?: string;
}

export interface ClaimResponse {
  success: boolean;
  /** Amount claimed in yocto-SOCIAL ("0" when nothing to claim). */
  claimed: string;
  tx_hash?: string | null;
  account_id?: string;
  /** Branding string — e.g. "OnSocial stands with Acme Community" */
  powered_by?: string;
  error?: string;
}

export interface UserReward {
  total_earned: string;
  claimable: string;
  claimed: string;
  daily_earned: string;
  last_day: number;
}

export interface UserAppReward {
  total_earned: string;
  daily_earned: string;
  last_day: number;
}

export interface AppConfig {
  label: string;
  reward_per_action: string;
  daily_cap: string;
  daily_budget: string;
  daily_budget_spent: string;
  budget_last_day: number;
  total_budget: string;
  total_credited: string;
  authorized_callers: string[];
}

export interface ContractInfo {
  version: string;
  owner_id: string;
  social_token: string;
  max_daily: string;
  pool_balance: string;
  total_credited: string;
  total_claimed: string;
  intents_executors: string[];
  authorized_callers: string[];
  app_ids: string[];
}
