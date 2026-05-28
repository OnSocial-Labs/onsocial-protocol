// ---------------------------------------------------------------------------
// Per-app reward limits — derived from on-chain governance config
// ---------------------------------------------------------------------------
// Daily caps and reward amounts come from the rewards contract per app_id.
// No global backend cap: each app has its own daily_cap on-chain.

import { config } from '../config/index.js';
import { viewContract } from './near.js';

const YOCTO_FACTOR = 1_000_000_000_000_000_000n;
const APP_CONFIG_CACHE_TTL_MS = 5 * 60_000;

export interface OnChainAppRewardConfig {
  label: string;
  dailyCapYocto: bigint;
  rewardPerActionYocto: bigint;
  active: boolean;
}

export interface AppCreditHeadroom {
  appId: string;
  dailyEarnedYocto: bigint;
  dailyRemainingYocto: bigint;
  dailyCapYocto: bigint;
  rewardPerActionYocto: bigint;
  appActive: boolean;
}

export type AppCreditDecision =
  | { allowed: true; amountYocto: bigint; headroom: AppCreditHeadroom }
  | { allowed: false; reason: string; headroom?: AppCreditHeadroom };

const appConfigCache = new Map<
  string,
  { config: OnChainAppRewardConfig; fetchedAt: number }
>();

function parseYocto(value: unknown): bigint {
  if (value === undefined || value === null) return 0n;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return 0n;
  }
}

export function yoctoToSocialNumber(yocto: bigint): number {
  return Number(yocto) / Number(YOCTO_FACTOR);
}

export function formatSocialAmount(yocto: bigint): string {
  const whole = yocto / YOCTO_FACTOR;
  const fraction = yocto % YOCTO_FACTOR;
  if (fraction === 0n) return whole.toString();
  const decimals = fraction.toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}.${decimals}`;
}

export function socialDecimalToYocto(amount: string | number): bigint {
  const [intPart, decPart = ''] = String(amount).split('.');
  const padded = decPart.padEnd(18, '0').slice(0, 18);
  return BigInt(`${intPart}${padded}`);
}

function envFallbackConfig(appId: string): OnChainAppRewardConfig | null {
  if (appId !== config.appId && appId !== config.portalRewardsAppId) {
    return null;
  }
  return {
    label: appId,
    dailyCapYocto: socialDecimalToYocto(config.rewards.dailyCap),
    rewardPerActionYocto: socialDecimalToYocto(config.rewards.messageReward),
    active: true,
  };
}

/** Cached on-chain app config (daily_cap, reward_per_action, active). */
export async function getOnChainAppRewardConfig(
  appId: string
): Promise<OnChainAppRewardConfig | null> {
  const cached = appConfigCache.get(appId);
  if (cached && Date.now() - cached.fetchedAt < APP_CONFIG_CACHE_TTL_MS) {
    return cached.config;
  }

  const raw = await viewContract<{
    label?: string;
    daily_cap?: string;
    reward_per_action?: string;
    active?: boolean;
  } | null>('get_app_config', { app_id: appId });

  if (!raw) {
    return envFallbackConfig(appId);
  }

  const parsed: OnChainAppRewardConfig = {
    label: raw.label ?? appId,
    dailyCapYocto: parseYocto(raw.daily_cap),
    rewardPerActionYocto: parseYocto(raw.reward_per_action),
    active: raw.active ?? false,
  };

  appConfigCache.set(appId, { config: parsed, fetchedAt: Date.now() });
  return parsed;
}

/** Per-app daily headroom for an account (from get_user_rewards_overview). */
export async function getAppCreditHeadroom(
  accountId: string,
  appId: string
): Promise<AppCreditHeadroom | null> {
  const appConfig = await getOnChainAppRewardConfig(appId);
  if (!appConfig) return null;

  const overview = await viewContract<{
    app?: {
      app_active?: boolean;
      daily_earned?: string;
      daily_remaining?: string;
    } | null;
  }>('get_user_rewards_overview', {
    account_id: accountId,
    app_id: appId,
  });

  const appMetrics = overview?.app;
  const dailyEarnedYocto = parseYocto(appMetrics?.daily_earned);
  const dailyRemainingYocto =
    appMetrics !== undefined && appMetrics !== null
      ? parseYocto(appMetrics.daily_remaining)
      : appConfig.dailyCapYocto;

  return {
    appId,
    dailyEarnedYocto,
    dailyRemainingYocto,
    dailyCapYocto: appConfig.dailyCapYocto,
    rewardPerActionYocto: appConfig.rewardPerActionYocto,
    appActive: appMetrics?.app_active ?? appConfig.active,
  };
}

/**
 * Pre-flight check before crediting on-chain.
 * Uses per-app daily_remaining only — no global backend cap.
 */
export async function evaluateAppCredit(
  accountId: string,
  appId: string,
  amountYocto?: bigint
): Promise<AppCreditDecision> {
  const headroom = await getAppCreditHeadroom(accountId, appId);
  if (!headroom) {
    return { allowed: false, reason: 'app_not_configured' };
  }

  if (!headroom.appActive) {
    return { allowed: false, reason: 'app_inactive', headroom };
  }

  const requested = amountYocto ?? headroom.rewardPerActionYocto;
  if (requested <= 0n) {
    return { allowed: false, reason: 'invalid_amount', headroom };
  }

  if (headroom.dailyRemainingYocto < requested) {
    return { allowed: false, reason: 'daily_cap', headroom };
  }

  return { allowed: true, amountYocto: requested, headroom };
}
