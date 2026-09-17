import {
  isCardFormatPalette,
  splitMoodKey,
  type Palette,
} from '@onsocial/text-card';
import type { ScarceCardThemeOptions } from '@/features/scarces/scarce-card-mood-picker';
import {
  defaultArticleCoverPin,
  type ArticleCoverPin,
} from '@/lib/article-post-payload';

const FALLBACK_PALETTE: Palette = 'night';

/** Scarce picker theme from a stored / resolved article cover pin. */
export function articleCoverPinToTheme(
  pin: ArticleCoverPin
): ScarceCardThemeOptions {
  const split = splitMoodKey(pin.mood);
  const palette: Palette =
    split && isCardFormatPalette(pin.format, split.palette)
      ? split.palette
      : FALLBACK_PALETTE;
  return {
    cardFormat: pin.format,
    cardPalette: palette,
    cardBg: pin.mood,
    cardMarkShape: pin.markShape,
    cardMarkColor: pin.markColor,
    cardTitleAlign: 'left',
  };
}

/** Persistable cover pin from the scarce picker theme. */
export function themeToArticleCoverPin(
  theme: ScarceCardThemeOptions
): ArticleCoverPin {
  return {
    mood: theme.cardBg,
    format: theme.cardFormat,
    markShape: theme.cardMarkShape,
    markColor: theme.cardMarkColor,
  };
}

export function defaultArticleCoverTheme(): ScarceCardThemeOptions {
  return articleCoverPinToTheme(defaultArticleCoverPin());
}
