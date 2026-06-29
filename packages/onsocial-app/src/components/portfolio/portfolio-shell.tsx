import type { CSSProperties, ReactNode } from 'react';
import { PortfolioHeroTop } from '@/components/portfolio/portfolio-hero-top';
import type { PageAvatarMode, PublicPageConfig, ResolvedPageHero } from '@/lib/page-data';
import { resolvePageFace } from '@/lib/page-face';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioShellProps {
  mood: ResolvedMood;
  config: PublicPageConfig;
  avatarMode?: PageAvatarMode;
  avatarMedia?: ResolvedPageHero | null;
  bannerMedia?: ResolvedPageHero | null;
  isPreviewing?: boolean;
  children: ReactNode;
}

export function PortfolioShell({
  mood,
  config,
  avatarMode = 'standard',
  avatarMedia = null,
  bannerMedia = null,
  isPreviewing = false,
  children,
}: PortfolioShellProps) {
  const { hero, isCoverLayout } = resolvePageFace({
    config,
    avatarMode,
    avatarMedia,
    bannerMedia,
  });
  const hasBanner = Boolean(hero);
  const isMoodOnly = !hasBanner;
  const isGlassFinish = mood.id === 'glass';

  return (
    <main
      className="frame app-surface portfolio-frame"
      data-mood={mood.id}
      data-has-banner={hasBanner ? 'true' : undefined}
      data-mood-only={isMoodOnly ? 'true' : undefined}
      data-avatar-mode={avatarMode}
      data-avatar-cover={isCoverLayout ? 'true' : undefined}
      data-face-preview={isPreviewing ? 'true' : undefined}
      style={mood.cssVars as CSSProperties}
    >
      <div className="portfolio-page">
        {isGlassFinish ? (
          <>
            <div className="portfolio-glass-ambient" aria-hidden="true" />
            <div className="portfolio-glass-sheet" aria-hidden="true" />
          </>
        ) : null}

        {hero && isCoverLayout ? (
          <PortfolioHeroTop hero={hero} layout="cover" />
        ) : null}

        <div
          className={
            hasBanner
              ? 'portfolio-banner-region'
              : 'portfolio-banner-region portfolio-banner-region--mood-only'
          }
          aria-hidden="true"
        >
          {hero && !isCoverLayout ? (
            <PortfolioHeroTop hero={hero} layout="banner" />
          ) : null}
        </div>

        <div className="portfolio-hero portfolio-hero--strip-overlap">{children}</div>
      </div>
    </main>
  );
}
