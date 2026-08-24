import { describe, expect, it } from 'vitest';
import {
  LAUNCHER_PEEK_DISPLAY_LIMIT,
  launcherPeekOverflowLabel,
} from '@/components/launcher-home/launcher-home-copy';

describe('launcher-home-copy', () => {
  it('caps visible peeks at eight', () => {
    expect(LAUNCHER_PEEK_DISPLAY_LIMIT).toBe(8);
  });

  it('formats overflow labels with counts', () => {
    expect(launcherPeekOverflowLabel(8, 'home')).toBeNull();
    expect(launcherPeekOverflowLabel(12, 'home')).toBe('4 more in Home');
    expect(launcherPeekOverflowLabel(20, 'discover')).toBe('12 more in Discover');
  });
});
