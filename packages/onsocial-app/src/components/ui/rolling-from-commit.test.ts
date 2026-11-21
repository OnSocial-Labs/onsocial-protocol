import { describe, expect, it } from 'vitest';
import { rollingMotion } from '@/components/ui/rolling-digits';

describe('confirm roll including zero crossing', () => {
  it('rolls 0→1 and 1→0 on a confirm signal (mask fades the outgoing face)', () => {
    expect(rollingMotion(1, 0, { fromValue: 0, toValue: 1 })).toBe('roll');
    expect(rollingMotion(2, 1, { fromValue: 1, toValue: 0 })).toBe('roll');
    expect(rollingMotion(1, 1, { fromValue: 0, toValue: 1 })).toBe('snap');
  });
});
