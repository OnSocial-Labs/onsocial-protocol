/** Resale royalty presets in basis points (1000 = 10%). */
export const ROYALTY_PRESETS = [
  { percent: 0, bps: 0 },
  { percent: 5, bps: 500 },
  { percent: 10, bps: 1000 },
  { percent: 15, bps: 1500 },
] as const;

export const DEFAULT_ROYALTY_BPS = 1000;
export const MAX_ROYALTY_BPS = 5_000;
/** Protocol marketplace fee on primary + secondary sales (matches contract default). */
export const MARKETPLACE_FEE_BPS = 200;

export function parseCustomRoyaltyBps(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.(?:0|5))?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return Number.isSafeInteger(bps) && bps <= MAX_ROYALTY_BPS ? bps : null;
}

export function normalizeCustomRoyaltyInput(raw: string): string {
  const sanitized = raw.replace(/[^\d.]/g, '');
  if (!sanitized) return '';
  const [whole, ...fractions] = sanitized.split('.');
  if (fractions.length === 0) return whole;
  return `${whole || '0'}.${fractions.join('').slice(0, 1)}`;
}

export function formatRoyaltyPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

/** Sum of royalty map values in bps (creator share when one recipient). */
export function totalRoyaltyBps(
  royalty: Record<string, number> | null | undefined
): number {
  if (!royalty) return 0;
  let total = 0;
  for (const value of Object.values(royalty)) {
    const n = Math.floor(Number(value));
    if (Number.isSafeInteger(n) && n > 0) total += n;
  }
  return total;
}
