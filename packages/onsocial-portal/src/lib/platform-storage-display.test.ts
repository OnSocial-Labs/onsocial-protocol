import { describe, expect, it } from 'vitest';
import {
  formatPlatformBufferRatioAriaLabel,
  formatPlatformBufferRatioLabel,
} from '@/lib/platform-storage-display';

describe('formatPlatformBufferRatioLabel', () => {
  it('collapses matching units into a fraction', () => {
    expect(formatPlatformBufferRatioLabel(6000, 6000)).toBe('6/6 KB');
    expect(formatPlatformBufferRatioLabel(3100, 6000)).toBe('3.1/6 KB');
  });

  it('keeps both units when they differ', () => {
    expect(formatPlatformBufferRatioLabel(500, 1_500_000)).toBe('500 B/1.5 MB');
  });
});

describe('formatPlatformBufferRatioAriaLabel', () => {
  it('reads as available of max buffer', () => {
    expect(formatPlatformBufferRatioAriaLabel(6000, 6000)).toBe(
      '6 KB of 6 KB buffer available'
    );
  });
});
