import { describe, expect, it } from 'vitest';
import { portfolioHeroPlayAction } from './portfolio-hero-play';

describe('portfolioHeroPlayAction', () => {
  it('toggles the release already in the dock', () => {
    expect(
      portfolioHeroPlayAction({
        pinnedId: 'midnight-ep',
        sessionId: 'midnight-ep',
        playing: true,
      })
    ).toBe('toggle');
    expect(
      portfolioHeroPlayAction({
        pinnedId: 'midnight-ep',
        sessionId: 'midnight-ep',
        playing: false,
      })
    ).toBe('toggle');
  });

  it('switches when the dock is empty or on another release', () => {
    expect(
      portfolioHeroPlayAction({
        pinnedId: 'midnight-ep',
        sessionId: null,
        playing: false,
      })
    ).toBe('switch');
    expect(
      portfolioHeroPlayAction({
        pinnedId: 'midnight-ep',
        sessionId: 'other-single',
        playing: true,
      })
    ).toBe('switch');
  });
});
