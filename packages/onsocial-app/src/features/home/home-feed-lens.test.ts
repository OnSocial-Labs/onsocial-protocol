import { describe, expect, it } from 'vitest';
import {
  homeFeedLensEmptyCopy,
  homeFeedLensLabel,
  homeFeedLensSubtitle,
  resolveHomeFeedLens,
} from '@/features/home/home-feed-lens';

describe('home-feed-lens', () => {
  it('labels and copy for standing, global, and saved', () => {
    expect(homeFeedLensLabel('standing')).toBe('Standing');
    expect(homeFeedLensLabel('global')).toBe('Global');
    expect(homeFeedLensLabel('saved')).toBe('Saved');
    expect(homeFeedLensSubtitle('standing')).toMatch(/stand with/i);
    expect(homeFeedLensSubtitle('global')).toMatch(/OnSocial/);
    expect(homeFeedLensSubtitle('saved')).toMatch(/bookmark/i);
    expect(homeFeedLensEmptyCopy('standing')).toMatch(/standing network/i);
    expect(homeFeedLensEmptyCopy('saved')).toMatch(/bookmark/i);
  });

  it('forces global when disconnected', () => {
    expect(resolveHomeFeedLens('standing', false)).toBe('global');
    expect(resolveHomeFeedLens('saved', false)).toBe('global');
    expect(resolveHomeFeedLens('standing', true)).toBe('standing');
    expect(resolveHomeFeedLens('saved', true)).toBe('saved');
    expect(resolveHomeFeedLens('global', true)).toBe('global');
  });
});
