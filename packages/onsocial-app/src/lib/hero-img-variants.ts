/**
 * Wide scarce heroes — the g7 adoption of the IPFS variant pipeline
 * (#610/#619). 384w serves 1x slots, 1080w retina (the writing
 * article-cover contract, #635); full-viewport art overlays use the feed
 * photo-enlarge rungs. Non-CDN / gif / svg sources bypass via the helper.
 */
export const SCARCE_HERO_WIDTHS = [384, 1080] as const;
export const SCARCE_OVERLAY_WIDTHS = [1080, 1920] as const;

/** App-column bleed heroes (collection covers, hub banners) — 36rem + pads. */
export const APP_COLUMN_HERO_SIZES = '(min-width: 640px) 608px, 100vw';
/** Square art stages capped at 28rem (listen/player covers, medium sheet). */
export const SQUARE_ART_SIZES = '(min-width: 640px) 448px, calc(100vw - 2rem)';
/** Overlay stages fit the smaller viewport axis. */
export const OVERLAY_ART_SIZES = '100vmin';
