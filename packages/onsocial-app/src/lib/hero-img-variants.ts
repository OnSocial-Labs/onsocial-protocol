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

/**
 * Editor one-off marks (g10) — badge/crest/logo wells at 4.25rem, the
 * profile editor avatar at 5–5.25rem. 128 covers 1x, 384 retina; the rung
 * pick is identical for every mark size in that range.
 */
export const EDITOR_MARK_WIDTHS = [128, 384] as const;
export const EDITOR_MARK_SIZES = '84px';
/**
 * Endorse-compose existing-media preview — height-capped at 12rem, so even
 * a 16:9 render stays under ~384px wide inside the sheet.
 */
export const ENDORSE_MEDIA_SIZES = '(min-width: 640px) 384px, 70vw';
