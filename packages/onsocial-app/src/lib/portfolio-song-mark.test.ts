import { describe, expect, it } from 'vitest';
import {
  portfolioSongMarkVisible,
  portfolioSongPinEligible,
} from './portfolio-song-mark';

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

describe('portfolioSongPinEligible', () => {
  it('keeps a release the page published', () => {
    expect(
      portfolioSongPinEligible({
        pageAccountId: 'artist.testnet',
        creatorId: 'artist.testnet',
        holdsCopy: false,
      })
    ).toBe(true);
  });

  it('keeps a collected album only while a copy is held', () => {
    expect(
      portfolioSongPinEligible({
        pageAccountId: 'fan.testnet',
        creatorId: 'artist.testnet',
        holdsCopy: true,
      })
    ).toBe(true);
    expect(
      portfolioSongPinEligible({
        pageAccountId: 'fan.testnet',
        creatorId: 'artist.testnet',
        holdsCopy: false,
      })
    ).toBe(false);
  });
});
