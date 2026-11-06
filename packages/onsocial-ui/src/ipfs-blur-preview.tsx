'use client';

import { IpfsImg } from './ipfs-img.js';
import { ipfsImgVariantUrl } from './ipfs-img-variants.js';

export const ipfsBlurPreviewClassName = 'ipfs-blur-preview';

/**
 * 128px stand-in painted under a feed or avatar image while the full
 * file arrives. Same format order as every other resized photo: avif,
 * then webp, then the original format. Decorative — the real image keeps
 * the accessible name. Returns null for URLs that cannot be resized
 * (gif, svg, off-host).
 */
export function IpfsBlurPreview({
  src,
  mime,
}: {
  src?: string | null;
  mime?: string | null;
}) {
  const preview = ipfsImgVariantUrl(src, 128, mime);
  if (!preview) return null;
  return (
    <IpfsImg
      src={preview}
      mime={mime}
      alt=""
      aria-hidden="true"
      className={ipfsBlurPreviewClassName}
      decoding="async"
      loading="lazy"
      fetchPriority="high"
    />
  );
}
