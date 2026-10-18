/** One gas-station digit step. Tie of 5 prefers the forward turn. */
export function shortestDigitDelta(from: number, to: number): number {
  const forward = (mod10(to) - mod10(from) + 10) % 10;
  return forward > 5 ? forward - 10 : forward;
}

/** Non-negative integer, most significant digit first. */
export function integerDigits(value: number): number[] {
  if (!Number.isFinite(value)) return [0];
  const n = Math.max(0, Math.trunc(value));
  if (!Number.isSafeInteger(n)) return [0];
  return Array.from(String(n), (glyph) => Number(glyph));
}

export function mod10(n: number): number {
  return ((Math.trunc(n) % 10) + 10) % 10;
}

/**
 * Resting index in the middle copy of a 0–9 strip repeated three times,
 * so a ±5 step stays on the strip.
 */
export const ROLLING_DIGIT_PARK = 10;

export const ROLLING_DIGIT_MS = 320;

export function parkedDigitPosition(digit: number): number {
  return ROLLING_DIGIT_PARK + mod10(digit);
}

/**
 * Next strip index for `targetDigit`, measured from the committed position
 * (the destination already stored), then parked back into the middle copy.
 */
export function nextDigitPosition(
  currentPos: number,
  targetDigit: number
): number {
  const fromDigit = mod10(currentPos);
  return (
    parkedDigitPosition(fromDigit) + shortestDigitDelta(fromDigit, targetDigit)
  );
}
