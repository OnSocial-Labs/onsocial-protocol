import { describe, expect, it } from 'vitest';
import {
  homeFeedLensEmptyCopy,
  homeFeedLensLabel,
  homeFeedLensSubtitle,
  resolveHomeFeedLens,
} from '@/features/home/home-feed-lens';

describe('home-feed-lens', () => {
  it('labels and copy for standing and global', () => {
    expect(homeFeedLensLabel('standing')).toBe('Standing');
    expect(homeFeedLensLabel('global')).toBe('Global');
    expect(homeFeedLensSubtitle('standing')).toMatch(/stand with/i);
    expect(homeFeedLensSubtitle('global')).toMatch(/OnSocial/);
    expect(homeFeedLensEmptyCopy('standing')).toMatch(/standing network/i);
  });

  it('forces global when disconnected', () => {
    expect(resolveHomeFeedLens('standing', false)).toBe('global');
    expect(resolveHomeFeedLens('standing', true)).toBe('standing');
    expect(resolveHomeFeedLens('global', true)).toBe('global');
  });
});
