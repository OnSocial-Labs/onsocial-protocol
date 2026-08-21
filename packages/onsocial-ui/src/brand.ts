import { ONSOCIAL_MARK_PATH } from './onsocial-mark.js';
import { ONSOCIAL_BRAND_TAGLINE } from './brand-copy.js';

/**
 * Canonical brand assets for apps and third-party embeds.
 *
 * In-repo: import {@link OnSocialMark} / {@link ONSOCIAL_MARK_PATH}.
 * External HTML/CSS: use {@link onsocialBrandMarkUrl} once the host serves
 * `/brand/onsocial-mark.svg` (shipped from app + portal `public/brand/`).
 */
export const ONSOCIAL_BRAND = {
  tagline: ONSOCIAL_BRAND_TAGLINE,
  /** Relative path under each consumer origin (`onsocial.id`, portal, …). */
  markSvgPath: '/brand/onsocial-mark.svg',
  /** Glyph path data (672×672) — same as `OnSocialMark`. */
  markPathData: ONSOCIAL_MARK_PATH,
} as const;

/** Absolute mark URL for embeds / social-link chips outside React. */
export function onsocialBrandMarkUrl(
  origin = 'https://onsocial.id'
): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${ONSOCIAL_BRAND.markSvgPath}`;
}
