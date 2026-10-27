import { ipfsImgSrcSet, ipfsImgVariantUrl } from '@onsocial/ui';
import type { ResolvedPageHero } from '@/lib/page-data';

interface PortfolioHeroTopProps {
  hero: ResolvedPageHero;
  layout: 'cover' | 'banner';
}

/** Full-bleed hero band — app column caps at 36rem on sm+, 100vw below. */
const HERO_IMG_SIZES = '(max-width: 640px) 100vw, 576px';

export function PortfolioHeroTop({ hero, layout }: PortfolioHeroTopProps) {
  const className =
    layout === 'cover' ? 'portfolio-avatar-cover' : 'portfolio-profile-banner';

  if (hero.kind === 'video') {
    return (
      <video
        className={`portfolio-hero-video ${className}`}
        src={hero.url}
        poster={
          hero.poster
            ? (ipfsImgVariantUrl(hero.poster, 1080) ?? hero.poster)
            : undefined
        }
        muted
        loop
        playsInline
        autoPlay
        aria-hidden
      />
    );
  }

  /* No MIME on profile media — gif/svg banners stay correct because the CDN
   * passes them through byte-identical (IMGPROXY_SKIP_PROCESSING_FORMATS). */
  const srcSet = ipfsImgSrcSet(hero.url, [1080, 1920]);
  return (
    <img
      className={className}
      src={hero.url}
      srcSet={srcSet}
      sizes={srcSet ? HERO_IMG_SIZES : undefined}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
