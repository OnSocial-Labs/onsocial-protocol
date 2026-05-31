/** Shared layout tokens for portal profile + discover pages. */
export const profilePageBannerSurfaceClass =
  'rounded-2xl shadow-[0_18px_42px_-28px_rgba(15,23,42,0.34)] md:rounded-[1.5rem] -mt-2 md:-mt-2';

/** Mobile page edge — apply once on the page wrapper. */
export const profilePageMobileGutterClass = 'max-md:px-4';

/** Extra inset for profile content below a full-bleed banner on mobile. */
export const profilePageMobileContentInsetClass = 'max-md:px-3';

/** Profile identity / stance content (inset below banner on mobile). */
export const profilePageHorizontalPaddingClass =
  'px-4 md:px-5 max-md:px-3';

/**
 * Discover column: full width inside the mobile gutter (matches banner width).
 * Desktop keeps the same px-4 / md:px-5 content padding as profile.
 */
export const profilePageDiscoverColumnClass = 'px-4 md:px-5 max-md:px-0';

/** Sticky rail drop shadow (gov rail, discover search). */
export const stickyRailShadowClass =
  'shadow-[0_18px_42px_-28px_rgba(15,23,42,0.34)]';

export const profilePageMobileContentMarginClass = 'max-md:mx-3';
