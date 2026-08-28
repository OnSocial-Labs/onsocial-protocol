import { describe, expect, it } from 'vitest';
import { isHomeFeedSocialLens } from '@/features/home/home-feed-pulse';

describe('home-feed-pulse', () => {
  it('treats pulse and circle as social graph lenses', () => {
    expect(isHomeFeedSocialLens('pulse')).toBe(true);
    expect(isHomeFeedSocialLens('circle')).toBe(true);
    expect(isHomeFeedSocialLens('global')).toBe(false);
    expect(isHomeFeedSocialLens('saved')).toBe(false);
  });
});
