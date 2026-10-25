import { finalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';

export const SCARCE_MIN_PRICE_NEAR = '0.01';
const NEAR_PRICE_DECIMALS = 5;
const USD_PRICE_DECIMALS = 2;
const PRICE_DECIMALS = NEAR_PRICE_DECIMALS;

export type ScarcePriceUnit = 'near' | 'usd';

/** Dollar sticker as an amount field value. Blank when the listing is in NEAR. */
export function usdE6AmountInput(
  usdE6: string | null | undefined
): string | null {
  if (!usdE6 || !/^\d+$/.test(usdE6)) return null;
  const value = BigInt(usdE6);
  if (value <= 0n) return null;
  const whole = value / 1_000_000n;
  const frac = (value % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

/** Millionths of a dollar. Null when the text is not a positive dollar amount. */
export function usdAmountToE6(priceUsd: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(priceUsd.trim());
  if (!match) return null;
  const whole = BigInt(match[1] ?? '0');
  const frac = (match[2] ?? '').padEnd(6, '0');
  const e6 = whole * 1_000_000n + BigInt(frac);
  return e6 > 0n ? e6 : null;
}

/**
 * Change-price opens in the unit the listing was created in.
 * A dollar sticker wins over the stored NEAR floor.
 */
export function scarcePriceChangeSeed(input: {
  listedPriceNear?: string | null;
  listedUsdE6?: string | null;
}): { unit: ScarcePriceUnit; amount: string } {
  const dollars = usdE6AmountInput(input.listedUsdE6);
  if (dollars) return { unit: 'usd', amount: dollars };
  const near = input.listedPriceNear?.trim() ?? '';
  return { unit: 'near', amount: near === '—' ? '' : near };
}

/**
 * NEAR keeps five decimals. Dollars keep cents, and any extra digits already
 * in the field, so switching units does not rewrite the number.
 */
export function scarcePriceInputDecimals(
  unit: ScarcePriceUnit,
  amount: string
): number {
  if (unit === 'near') return NEAR_PRICE_DECIMALS;
  const frac = (amount.split('.')[1] ?? '').replace(/0+$/, '');
  return Math.max(USD_PRICE_DECIMALS, Math.min(6, frac.length));
}

export function scarcePriceYocto(raw: string): bigint | null {
  const finalized = finalizeAmountInput(raw, PRICE_DECIMALS);
  if (!finalized) return null;
  try {
    return BigInt(nearToYocto(finalized));
  } catch {
    return null;
  }
}

function currentUsdE6(raw: string | null | undefined): bigint | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = BigInt(raw);
  return value > 0n ? value : null;
}

/** Fixed listing, a real price, and not the price already on the listing. */
export function scarcePriceChangeReady(input: {
  listingKind: 'fixed' | 'auction' | null;
  currentPriceNear?: string | null;
  nextPriceNear: string;
  /** Dollar checks stay in dollars. The NEAR floor applies only in NEAR. */
  unit?: ScarcePriceUnit;
  currentUsdE6?: string | null;
}): boolean {
  if (input.listingKind !== 'fixed') return false;
  if (input.unit === 'usd') {
    const next = usdAmountToE6(input.nextPriceNear);
    if (next == null) return false;
    const current = currentUsdE6(input.currentUsdE6);
    return current == null || current !== next;
  }
  const next = scarcePriceYocto(input.nextPriceNear);
  const min = scarcePriceYocto(SCARCE_MIN_PRICE_NEAR);
  if (next == null || min == null || next < min) return false;
  const current = input.currentPriceNear
    ? scarcePriceYocto(input.currentPriceNear)
    : null;
  return current == null || current !== next;
}

/** A line only after a bad or unchanged price. */
export function scarcePriceChangeHint(input: {
  currentPriceNear?: string | null;
  nextPriceNear: string;
  revealUnchanged?: boolean;
  unit?: ScarcePriceUnit;
  currentUsdE6?: string | null;
}): string | null {
  if (input.unit === 'usd') {
    const trimmed = input.nextPriceNear.trim();
    if (!trimmed) return null;
    const next = usdAmountToE6(trimmed);
    if (next == null) return 'Enter a price.';
    const current = currentUsdE6(input.currentUsdE6);
    if (input.revealUnchanged && current != null && current === next) {
      return 'This is the current price.';
    }
    return null;
  }
  const next = scarcePriceYocto(input.nextPriceNear);
  if (next == null) return null;
  const min = scarcePriceYocto(SCARCE_MIN_PRICE_NEAR);
  if (min != null && next < min) return `Minimum ${SCARCE_MIN_PRICE_NEAR} NEAR.`;
  const current = input.currentPriceNear
    ? scarcePriceYocto(input.currentPriceNear)
    : null;
  if (input.revealUnchanged && current != null && current === next) {
    return 'This is the current price.';
  }
  return null;
}
