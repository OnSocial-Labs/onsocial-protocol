'use client';

import type { CSSProperties, ReactNode } from 'react';
import { resolveDisplayProfileKind, type ProfileKind } from '@onsocial/sdk';
import { PortfolioHeroTop } from '@/components/portfolio/portfolio-hero-top';
import { useRegisterOsPortalHost } from '@/contexts/os-portal-host-context';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type {
  PageAvatarMode,
  PublicPageConfig,
  ResolvedPageHero,
} from '@/lib/page-data';
import {
  readPinnedBookId,
  readPinnedSongId,
  resolvePageFace,
} from '@/lib/page-face';
import { PortfolioBookMarkProvider } from '@/components/portfolio/portfolio-book-mark';
import { PortfolioSongMarkProvider } from '@/components/portfolio/portfolio-song-mark';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioShellProps {
  pageAccountId: string;
  isDao?: boolean;
  /** Optional `profile/kind` for avatar geometry on the frame. */
  profileKind?: ProfileKind | null;
  mood: ResolvedMood;
  config: PublicPageConfig;
  avatarMode?: PageAvatarMode;
  avatarMedia?: ResolvedPageHero | null;
  bannerMedia?: ResolvedPageHero | null;
  isPreviewing?: boolean;
  isPreviewingMood?: boolean;
  children: ReactNode;
}

export function PortfolioShell({
  pageAccountId,
  isDao = false,
  profileKind = null,
  mood,
  config,
  avatarMode = 'standard',
  avatarMedia = null,
  bannerMedia = null,
  isPreviewing = false,
  isPreviewingMood = false,
  children,
}: PortfolioShellProps) {
  const portalHostRef = useRegisterOsPortalHost<HTMLElement>();
  const songId = readPinnedSongId(config);
  const bookId = readPinnedBookId(config);
  const { hero, isCoverLayout } = resolvePageFace({
    config,
    avatarMode,
    avatarMedia,
    bannerMedia,
  });
  const hasBanner = Boolean(hero);
  const isMoodOnly = !hasBanner;
  const isGlassFinish = mood.id === 'glass';
  const shellStyle = portfolioMoodShellStyle(mood.cssVars);

  return (
    <main
      ref={portalHostRef}
      className="frame app-surface portfolio-frame"
      data-page-account={pageAccountId}
      data-profile-kind={resolveDisplayProfileKind(profileKind, isDao)}
      data-mood={mood.id}
      data-mood-preview={isPreviewingMood ? 'true' : undefined}
      data-has-banner={hasBanner ? 'true' : undefined}
      data-mood-only={isMoodOnly ? 'true' : undefined}
      data-avatar-mode={avatarMode}
      data-avatar-cover={isCoverLayout ? 'true' : undefined}
      data-face-preview={isPreviewing ? 'true' : undefined}
      style={shellStyle as CSSProperties}
    >
      <div className="portfolio-page" suppressHydrationWarning>
        {isGlassFinish ? (
          <div className="portfolio-glass-sheet" aria-hidden="true" />
        ) : null}

        <div
          className={
            hasBanner
              ? 'portfolio-banner-region'
              : 'portfolio-banner-region portfolio-banner-region--mood-only'
          }
          aria-hidden="true"
        >
          {hero && isCoverLayout ? (
            <PortfolioHeroTop hero={hero} layout="cover" />
          ) : null}
          {hero && !isCoverLayout ? (
            <PortfolioHeroTop hero={hero} layout="banner" />
          ) : null}
        </div>

        <PortfolioSongMarkProvider
          collectionId={hero && songId ? songId : null}
          pageAccountId={pageAccountId}
        >
          <PortfolioBookMarkProvider
            collectionId={hero && bookId ? bookId : null}
            pageAccountId={pageAccountId}
          >
            <div className="portfolio-hero portfolio-hero--strip-overlap">
              {children}
            </div>
          </PortfolioBookMarkProvider>
        </PortfolioSongMarkProvider>
      </div>
    </main>
  );
}
