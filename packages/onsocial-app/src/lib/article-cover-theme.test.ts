import { describe, expect, it } from 'vitest';
import {
  articleCoverPinToTheme,
  defaultArticleCoverTheme,
  themeToArticleCoverPin,
} from './article-cover-theme';
import { defaultArticleCoverPin } from './article-post-payload';

describe('articleCoverPinToTheme', () => {
  it('maps the default pin onto the scarce picker theme', () => {
    expect(defaultArticleCoverTheme()).toEqual({
      cardFormat: 'thought',
      cardPalette: 'night',
      cardBg: 'thought-night',
      cardMarkShape: 'rule',
      cardMarkColor: 'auto',
      cardTitleAlign: 'left',
    });
  });

  it('round-trips craft through theme ↔ pin', () => {
    const pin = {
      mood: 'poster-noir' as const,
      format: 'poster' as const,
      markShape: 'bar' as const,
      markColor: 'amber' as const,
    };
    expect(themeToArticleCoverPin(articleCoverPinToTheme(pin))).toEqual(pin);
  });

  it('falls back to night when the mood has no palette split', () => {
    expect(
      articleCoverPinToTheme({
        ...defaultArticleCoverPin(),
        mood: 'mono-matrix',
        format: 'mono',
      }).cardPalette
    ).toBe('night');
  });
});
