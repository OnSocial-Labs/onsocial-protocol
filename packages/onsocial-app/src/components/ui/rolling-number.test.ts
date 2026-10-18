import { describe, expect, it } from 'vitest';
import {
  integerDigits,
  nextDigitPosition,
  parkedDigitPosition,
  shortestDigitDelta,
} from './rolling-number';

describe('shortestDigitDelta', () => {
  it('rolls forward through the in-between digits', () => {
    expect(shortestDigitDelta(2, 5)).toBe(3);
  });

  it('rolls backward when that turn is shorter', () => {
    expect(shortestDigitDelta(5, 2)).toBe(-3);
    expect(shortestDigitDelta(0, 9)).toBe(-1);
  });

  it('carries 9 onto the next 0', () => {
    expect(shortestDigitDelta(9, 0)).toBe(1);
  });

  it('prefers the forward turn when the two ways are equal', () => {
    expect(shortestDigitDelta(0, 5)).toBe(5);
    expect(shortestDigitDelta(5, 0)).toBe(5);
  });
});

describe('integerDigits', () => {
  it('keeps a zero and splits places from the left', () => {
    expect(integerDigits(0)).toEqual([0]);
    expect(integerDigits(15)).toEqual([1, 5]);
    expect(integerDigits(100)).toEqual([1, 0, 0]);
  });

  it('drops a fraction and rejects a non-finite value', () => {
    expect(integerDigits(12.8)).toEqual([1, 2]);
    expect(integerDigits(Number.NaN)).toEqual([0]);
  });
});

describe('nextDigitPosition', () => {
  it('steps the ones place from 2 to 5 inside the middle copy', () => {
    expect(nextDigitPosition(parkedDigitPosition(2), 5)).toBe(
      parkedDigitPosition(2) + 3
    );
  });

  it('rolls 9 forward onto an extra 0 cell', () => {
    expect(nextDigitPosition(parkedDigitPosition(9), 0)).toBe(20);
  });

  it('retargets from the stored destination, not a half-turned wheel', () => {
    const stored = nextDigitPosition(parkedDigitPosition(9), 0);
    expect(stored).toBe(20);
    expect(nextDigitPosition(stored, 1)).toBe(11);
  });
});
