import { finalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';

export const SCARCE_MIN_PRICE_NEAR = '0.01';
const PRICE_DECIMALS = 5;

export function scarcePriceYocto(raw: string): bigint | null {
  const finalized = finalizeAmountInput(raw, PRICE_DECIMALS);
  if (!finalized) return null;
  try {
    return BigInt(nearToYocto(finalized));
  } catch {
    return null;
  }
}

/** Fixed listing, a real price, and not the price already on the listing. */
export function scarcePriceChangeReady(input: {
  listingKind: 'fixed' | 'auction' | null;
  currentPriceNear?: string | null;
  nextPriceNear: string;
}): boolean {
  if (input.listingKind !== 'fixed') return false;
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
}): string | null {
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
