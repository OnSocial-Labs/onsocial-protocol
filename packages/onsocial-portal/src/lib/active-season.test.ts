import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RALLY_DISPLAY_NAME,
  resolveSeasonHeroTitle,
} from '@/lib/active-season';

describe('resolveSeasonHeroTitle', () => {
  it('prefers a human on-chain label over the season id', () => {
    expect(
      resolveSeasonHeroTitle({
        seasonId: 'season-three',
        onChainLabel: 'Spring Rally',
      })
    ).toEqual({ title: 'Spring Rally', showSeasonId: false });
  });

  it('falls back to catalog title when on-chain label equals the id', () => {
    expect(
      resolveSeasonHeroTitle({
        seasonId: 'season-one',
        onChainLabel: 'season-one',
        catalogTitle: 'OnSocial Rally',
      })
    ).toEqual({ title: 'OnSocial Rally', showSeasonId: false });
  });

  it('uses the default rally name for numbered seasons without a label', () => {
    expect(
      resolveSeasonHeroTitle({
        seasonId: 'season-three',
        onChainLabel: 'season-three',
      })
    ).toEqual({ title: DEFAULT_RALLY_DISPLAY_NAME, showSeasonId: false });
  });
});
