import type { ResolvedPageHero } from '@/lib/page-data';

interface PortfolioHeroTopProps {
  hero: ResolvedPageHero;
  layout: 'cover' | 'banner';
}

export function PortfolioHeroTop({ hero, layout }: PortfolioHeroTopProps) {
  const className =
    layout === 'cover' ? 'portfolio-avatar-cover' : 'portfolio-profile-banner';

  if (hero.kind === 'video') {
    return (
      <video
        className={`portfolio-hero-video ${className}`}
        src={hero.url}
        poster={hero.poster}
        muted
        loop
        playsInline
        autoPlay
        aria-hidden
      />
    );
  }

  return (
    <img className={className} src={hero.url} alt="" aria-hidden="true" />
  );
}
