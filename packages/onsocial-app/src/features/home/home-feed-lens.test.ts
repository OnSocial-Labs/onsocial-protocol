import { describe, expect, it } from 'vitest';
import {
  HOME_FEED_CIRCLE_LENS_ENABLED,
  homeFeedLensEmptyCopy,
  homeFeedLensLabel,
  homeFeedLensSubtitle,
  homeFeedVisibleLenses,
  resolveHomeFeedLens,
} from '@/features/home/home-feed-lens';

describe('home-feed-lens', () => {
  it('labels and copy for pulse, circle, global, and saved', () => {
    expect(homeFeedLensLabel('pulse')).toBe('Pulse');
    expect(homeFeedLensLabel('circle')).toBe('Circle');
    expect(homeFeedLensLabel('global')).toBe('Global');
    expect(homeFeedLensLabel('saved')).toBe('Saved');
    expect(homeFeedLensSubtitle('pulse')).toMatch(/stand with/i);
    expect(homeFeedLensSubtitle('circle')).toMatch(/stand with only/i);
    expect(homeFeedLensSubtitle('global')).toMatch(/OnSocial/);
    expect(homeFeedLensSubtitle('saved')).toMatch(/bookmark/i);
    expect(homeFeedLensEmptyCopy('pulse')).toMatch(/pulse/i);
    expect(homeFeedLensEmptyCopy('circle')).toMatch(/circle/i);
    expect(homeFeedLensEmptyCopy('saved')).toMatch(/bookmark/i);
  });

  it('hides circle from visible chips by default', () => {
    expect(HOME_FEED_CIRCLE_LENS_ENABLED).toBe(false);
    expect(homeFeedVisibleLenses(true)).toEqual(['pulse', 'global', 'saved']);
    expect(homeFeedVisibleLenses(false)).toEqual(['global']);
  });

  it('forces global when disconnected', () => {
    expect(resolveHomeFeedLens('pulse', false)).toBe('global');
    expect(resolveHomeFeedLens('circle', false)).toBe('global');
    expect(resolveHomeFeedLens('saved', false)).toBe('global');
    expect(resolveHomeFeedLens('pulse', true)).toBe('pulse');
    expect(resolveHomeFeedLens('circle', true)).toBe('pulse');
    expect(resolveHomeFeedLens('saved', true)).toBe('saved');
    expect(resolveHomeFeedLens('global', true)).toBe('global');
  });
});
