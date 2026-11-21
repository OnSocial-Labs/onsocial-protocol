import { describe, expect, it } from 'vitest';
import { rollingMotion } from '@/components/ui/rolling-digits';

describe('first-like zero crossing paint', () => {
  it('rolls 0→1 on confirm so the ones place turns with the strip', () => {
    expect(rollingMotion(1, 0)).toBe('roll');
    expect(rollingMotion(2, 1)).toBe('roll');
  });
});
