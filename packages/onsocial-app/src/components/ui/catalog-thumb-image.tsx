'use client';

import { ipfsImgSrcSet } from '@onsocial/ui';

/**
 * Catalog cover slot (`--os-catalog-cover`): 4.85rem (77.6px), 5.5rem
 * (88px) at sm+. 128 covers 1x, 384 covers retina.
 */
const CATALOG_THUMB_WIDTHS = [128, 384] as const;
const CATALOG_THUMB_SIZES = '(min-width: 640px) 88px, 78px';

/**
 * Page-drawer media rail / grid cards: `minmax(9rem, 42%)` of the drawer —
 * up to ~235px. 384 covers 1x + change, 128 keeps tiny dense grids cheap.
 */
const CATALOG_COVER_WIDTHS = [128, 384] as const;
const CATALOG_COVER_SIZES = '(min-width: 640px) 235px, 42vw';

/**
 * Shared <img> for .market-listing-thumb catalog rows — CDN variant srcSet
 * + lazy/async so list screens stop fetching full-size originals per row.
 * Non-CDN srcs (gif/svg bypass, external URLs) get no srcSet and behave as
 * before, still lazy.
 */
export function CatalogThumbImage({
  src,
  onError,
}: {
  src: string;
  onError?: () => void;
}) {
  const srcSet = ipfsImgSrcSet(src, CATALOG_THUMB_WIDTHS);
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? CATALOG_THUMB_SIZES : undefined}
      alt=""
      loading="lazy"
      decoding="async"
      onError={onError}
    />
  );
}

/** Square page-drawer cover card (collectibles rail, created rail, media grid). */
export function CatalogCoverImage({ src }: { src: string }) {
  const srcSet = ipfsImgSrcSet(src, CATALOG_COVER_WIDTHS);
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? CATALOG_COVER_SIZES : undefined}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}
