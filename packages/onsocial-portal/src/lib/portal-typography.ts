/**
 * Portal typography tokens.
 *
 * Sizes are rem-based — defined in globals.css @layer components.
 * Dense UI tokens stay fixed on mobile/desktop; body/lead bump slightly at md+.
 *
 * Scale (matches pre-refactor px):
 *   micro    10px   tiny badges
 *   caption  10px   timestamps, compact meta
 *   label    11px   pills, secondary labels, metrics
 *   bodySm   12px   modal descriptions, metric values
 *   body     13px → 14px @ md   list titles, menu rows
 *   lead     14px → 16px @ md   nav emphasis
 *   display  21px   hero stats, reputation scores
 */

export const portalType = {
  micro: 'portal-type-micro',
  caption: 'portal-type-caption',
  label: 'portal-type-label',
  bodySm: 'portal-type-body-sm',
  body: 'portal-type-body',
  lead: 'portal-type-lead',
  display: 'portal-type-display',
} as const;

/** Uppercase section label — 10px, tracking 0.14em */
export const portalEyebrow = 'portal-eyebrow';

/** Uppercase section label — 10px, tracking 0.18em */
export const portalEyebrowWide = 'portal-eyebrow-wide';

/** Marketing / landing page fluid sizes (clamp-based) */
export const portalFluid = {
  hero: 'text-fluid-hero',
  heading: 'text-fluid-heading',
  subheading: 'text-fluid-subheading',
  body: 'text-fluid-body',
} as const;

export type PortalTypeToken = (typeof portalType)[keyof typeof portalType];
