import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import type { Tier } from '../../types/index.js';
import {
  BURST_ALLOWANCE_BY_TIER,
  computeBoostedLimit,
  monthKey,
  type BurstAllowanceTierConfig,
} from './config.js';

export type BurstAllowanceStatus = {
  creditsPerMonth: number;
  creditsRemaining: number;
  multiplier: number;
  baseLimit: number;
  boostedLimit: number;
  burstActive: boolean;
  resetsAt: string;
};

export type BurstActivationResult =
  | {
      ok: true;
      creditsRemaining: number;
      boostedLimit: number;
      consumedCredit: boolean;
    }
  | { ok: false; creditsRemaining: number };

function tierConfig(tier: Tier): BurstAllowanceTierConfig {
  return BURST_ALLOWANCE_BY_TIER[tier] ?? BURST_ALLOWANCE_BY_TIER.free;
}

function creditsKey(accountId: string, month = monthKey()): string {
  return `burst:credits:${accountId}:${month}`;
}

function windowKey(accountId: string): string {
  return `burst:window:${accountId}`;
}

function endOfUtcMonth(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
}

export function resolveBoostedLimitForTier(tier: Tier): number {
  const cfg = tierConfig(tier);
  const baseLimit = config.rateLimits[tier];
  return computeBoostedLimit(
    baseLimit,
    cfg.multiplier,
    config.rateLimits.service
  );
}

type ActivationResult = {
  activated: boolean;
  creditsRemaining: number;
  consumedCredit: boolean;
};

interface BurstAllowanceStore {
  activateWindow(
    accountId: string,
    ttlSec: number,
    allowance: number
  ): Promise<ActivationResult>;
  getCreditsRemaining(accountId: string, allowance: number): Promise<number>;
  isWindowActive(accountId: string): Promise<boolean>;
}

class MemoryBurstStore implements BurstAllowanceStore {
  private credits = new Map<string, number>();
  private windows = new Map<string, number>();

  private purgeExpiredWindows(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.windows) {
      if (expiresAt <= now) this.windows.delete(key);
    }
  }

  private ensureCredits(accountId: string, allowance: number): number {
    const key = creditsKey(accountId);
    if (!this.credits.has(key)) {
      this.credits.set(key, allowance);
    }
    return this.credits.get(key)!;
  }

  async isWindowActive(accountId: string): Promise<boolean> {
    this.purgeExpiredWindows();
    const expiresAt = this.windows.get(windowKey(accountId));
    return expiresAt != null && expiresAt > Date.now();
  }

  async activateWindow(
    accountId: string,
    ttlSec: number,
    allowance: number
  ): Promise<ActivationResult> {
    this.purgeExpiredWindows();
    const wKey = windowKey(accountId);
    const active =
      this.windows.has(wKey) && this.windows.get(wKey)! > Date.now();

    if (active) {
      const remaining = this.ensureCredits(accountId, allowance);
      return {
        activated: true,
        creditsRemaining: remaining,
        consumedCredit: false,
      };
    }

    const remaining = this.ensureCredits(accountId, allowance);
    if (remaining <= 0) {
      return { activated: false, creditsRemaining: 0, consumedCredit: false };
    }

    this.credits.set(creditsKey(accountId), remaining - 1);
    this.windows.set(wKey, Date.now() + ttlSec * 1000);
    return {
      activated: true,
      creditsRemaining: remaining - 1,
      consumedCredit: true,
    };
  }

  async getCreditsRemaining(
    accountId: string,
    allowance: number
  ): Promise<number> {
    return this.ensureCredits(accountId, allowance);
  }
}

class RedisBurstStore implements BurstAllowanceStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly client: any) {}

  private async ensureCredits(
    accountId: string,
    allowance: number
  ): Promise<number> {
    const key = creditsKey(accountId);
    const existing = await this.client.get(key);
    if (existing != null) {
      return Number.parseInt(existing, 10);
    }
    await this.client.set(key, String(allowance), 'NX');
    const value = await this.client.get(key);
    return Number.parseInt(value ?? String(allowance), 10);
  }

  async isWindowActive(accountId: string): Promise<boolean> {
    return (await this.client.exists(windowKey(accountId))) === 1;
  }

  async activateWindow(
    accountId: string,
    ttlSec: number,
    allowance: number
  ): Promise<ActivationResult> {
    const wKey = windowKey(accountId);
    const cKey = creditsKey(accountId);

    if ((await this.client.exists(wKey)) === 1) {
      const remaining = await this.ensureCredits(accountId, allowance);
      return {
        activated: true,
        creditsRemaining: remaining,
        consumedCredit: false,
      };
    }

    await this.ensureCredits(accountId, allowance);
    const script = `
      local credits = tonumber(redis.call('GET', KEYS[1]) or ARGV[1])
      if credits <= 0 then
        return {0, credits, 0}
      end
      credits = redis.call('DECR', KEYS[1])
      redis.call('SETEX', KEYS[2], ARGV[2], '1')
      return {1, credits, 1}
    `;
    const result = (await this.client.eval(
      script,
      2,
      cKey,
      wKey,
      String(allowance),
      String(Math.max(1, ttlSec))
    )) as [number, number, number];

    return {
      activated: result[0] === 1,
      creditsRemaining: result[1],
      consumedCredit: result[2] === 1,
    };
  }

  async getCreditsRemaining(
    accountId: string,
    allowance: number
  ): Promise<number> {
    return this.ensureCredits(accountId, allowance);
  }
}

let store: BurstAllowanceStore = new MemoryBurstStore();

export function initBurstAllowanceStore(redisClient: unknown | null): void {
  if (redisClient) {
    store = new RedisBurstStore(redisClient);
    logger.info('Burst allowance: using Redis');
    return;
  }
  store = new MemoryBurstStore();
  if (config.nodeEnv === 'production') {
    logger.warn(
      'Burst allowance: in-memory store (set REDIS_URL for shared credits)'
    );
  }
}

/** Test hook — reset to in-memory store. */
export function resetBurstAllowanceStoreForTests(): void {
  store = new MemoryBurstStore();
}

export async function activateBurstForWindow(
  accountId: string,
  tier: Tier,
  windowTtlSec: number
): Promise<BurstActivationResult> {
  const cfg = tierConfig(tier);
  if (cfg.creditsPerMonth <= 0 || cfg.multiplier <= 1) {
    return { ok: false, creditsRemaining: 0 };
  }

  const activation = await store.activateWindow(
    accountId,
    windowTtlSec,
    cfg.creditsPerMonth
  );

  if (!activation.activated) {
    return { ok: false, creditsRemaining: activation.creditsRemaining };
  }

  return {
    ok: true,
    creditsRemaining: activation.creditsRemaining,
    boostedLimit: resolveBoostedLimitForTier(tier),
    consumedCredit: activation.consumedCredit,
  };
}

export async function getBurstAllowanceStatus(
  accountId: string,
  tier: Tier
): Promise<BurstAllowanceStatus> {
  const cfg = tierConfig(tier);
  const baseLimit = config.rateLimits[tier];
  const boostedLimit = resolveBoostedLimitForTier(tier);
  const creditsRemaining =
    cfg.creditsPerMonth > 0
      ? await store.getCreditsRemaining(accountId, cfg.creditsPerMonth)
      : 0;
  const burstActive = await store.isWindowActive(accountId);

  return {
    creditsPerMonth: cfg.creditsPerMonth,
    creditsRemaining,
    multiplier: cfg.multiplier,
    baseLimit,
    boostedLimit,
    burstActive,
    resetsAt: endOfUtcMonth().toISOString(),
  };
}

export {
  BURST_ALLOWANCE_BY_TIER,
  computeBoostedLimit,
  computeOverflowPoints,
} from './config.js';
