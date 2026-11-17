import { describe, expect, it } from 'vitest';
import { rollingMotion } from '@/components/ui/rolling-digits';

describe('first-like zero crossing paint', () => {
  it('snaps 0→1 so DigitRoll never rolls through a parked 0', () => {
    expect(rollingMotion(1, 0, { fromValue: 0, toValue: 1 })).toBe('snap');
    expect(rollingMotion(2, 1, { fromValue: 1, toValue: 0 })).toBe('snap');
  });
});
