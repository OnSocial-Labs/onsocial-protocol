import { describe, expect, it } from 'vitest';
import { portfolioSongMarkVisible } from './portfolio-song-mark';

describe('portfolioSongMarkVisible', () => {
  it('hides while the dock is on the pinned release', () => {
    expect(
      portfolioSongMarkVisible({
        pinnedId: 'midnight-ep',
        sessionId: 'midnight-ep',
      })
    ).toBe(false);
  });

  it('shows when the dock is empty or on another release', () => {
    expect(
      portfolioSongMarkVisible({
        pinnedId: 'midnight-ep',
        sessionId: null,
      })
    ).toBe(true);
    expect(
      portfolioSongMarkVisible({
        pinnedId: 'midnight-ep',
        sessionId: 'other-single',
      })
    ).toBe(true);
  });
});
