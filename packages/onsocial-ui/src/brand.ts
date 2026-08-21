import { ONSOCIAL_MARK_PATH } from './onsocial-mark.js';
import { ONSOCIAL_BRAND_TAGLINE } from './brand-copy.js';

export type OnSocialBrandMarkVariant = 'current' | 'black' | 'white';

/**
 * Canonical brand assets for apps and third-party embeds.
 *
 * In-repo: import {@link OnSocialMark} / {@link ONSOCIAL_MARK_PATH}.
 * External `<img>` embeds: use {@link onsocialBrandMarkUrl} with `black` or
 * `white` — `currentColor` does not inherit into image elements.
 */
export const ONSOCIAL_BRAND = {
  tagline: ONSOCIAL_BRAND_TAGLINE,
  /** Relative path under each consumer origin (`onsocial.id`, portal, …). */
  markSvgPath: '/brand/onsocial-mark.svg',
  markSvgPathBlack: '/brand/onsocial-mark-black.svg',
  markSvgPathWhite: '/brand/onsocial-mark-white.svg',
  /** Glyph path data (672×672) — same as `OnSocialMark`. */
  markPathData: ONSOCIAL_MARK_PATH,
} as const;

const MARK_PATH_BY_VARIANT: Record<OnSocialBrandMarkVariant, string> = {
  current: ONSOCIAL_BRAND.markSvgPath,
  black: ONSOCIAL_BRAND.markSvgPathBlack,
  white: ONSOCIAL_BRAND.markSvgPathWhite,
};

/** Absolute mark URL for embeds / social-link chips outside React. */
export function onsocialBrandMarkUrl(
  origin = 'https://onsocial.id',
  variant: OnSocialBrandMarkVariant = 'black'
): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${MARK_PATH_BY_VARIANT[variant]}`;
}
