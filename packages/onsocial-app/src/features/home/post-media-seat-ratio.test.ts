import { describe, expect, it } from 'vitest';
import { resolveReservedSeatAspect } from '@/features/home/post-media';

describe('reserved open/focused/quote seat ratio', () => {
  it('keeps 4:3 only until dims are known, then takes the real ratio', () => {
    expect(resolveReservedSeatAspect(undefined, undefined, null)).toBe('4 / 3');
    // No persisted hints — measured 16:9 from loadedmetadata must win.
    expect(resolveReservedSeatAspect(undefined, undefined, 16 / 9)).toBe(
      String(16 / 9)
    );
    expect(resolveReservedSeatAspect(1920, 1080, null)).toBe('1920 / 1080');
    expect(resolveReservedSeatAspect(1920, 1080, 16 / 9)).toBe('1920 / 1080');
  });
});
