import type { Tier } from '../../types/index.js';

export interface BurstAllowanceTierConfig {
  /** Forgiven burst windows per calendar month (one credit per hot 60s window). */
  creditsPerMonth: number;
  /** RPM multiplier applied when a credit is consumed. */
  multiplier: number;
}

export const BURST_ALLOWANCE_BY_TIER: Record<Tier, BurstAllowanceTierConfig> = {
  free: { creditsPerMonth: 0, multiplier: 1 },
  pro: { creditsPerMonth: 3, multiplier: 2 },
  scale: { creditsPerMonth: 5, multiplier: 5 },
  service: { creditsPerMonth: 0, multiplier: 1 },
};

export function computeBoostedLimit(
  baseLimit: number,
  multiplier: number,
  maxCap: number
): number {
  if (multiplier <= 1 || baseLimit <= 0) return baseLimit;
  return Math.min(baseLimit * multiplier, maxCap);
}

export function computeOverflowPoints(
  baseLimit: number,
  boostedLimit: number
): number {
  return Math.max(0, boostedLimit - baseLimit);
}

export function monthKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
