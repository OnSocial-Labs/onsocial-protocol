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

export type RollingGlyph =
  | { kind: 'digit'; digit: number; key: string }
  | { kind: 'sep'; key: string };

/** Digits, with a comma before each thousands group when `grouped` is set. */
export function rollingGlyphs(value: number, grouped: boolean): RollingGlyph[] {
  const digits = integerDigits(value);
  const glyphs: RollingGlyph[] = [];
  digits.forEach((digit, index) => {
    const place = digits.length - 1 - index;
    glyphs.push({ kind: 'digit', digit, key: `d-${place}` });
    if (grouped && place > 0 && place % 3 === 0) {
      glyphs.push({ kind: 'sep', key: `sep-${place}` });
    }
  });
  return glyphs;
}

/**
 * Drop supply omits the signal and rolls on every value change.
 * A confirm signal rolls only when that signal changes, so a later
 * refetch of the same card snaps instead of turning.
 */
export function rollingMotion(
  rollSignal: number | undefined,
  previousSignal: number | undefined
): 'roll' | 'snap' {
  if (rollSignal === undefined) return 'roll';
  return rollSignal === previousSignal ? 'snap' : 'roll';
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
