'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { PortfolioFacePreviewProvider } from '@/contexts/portfolio-face-preview-context';
import { PageContentDrawerProvider } from '@/contexts/page-content-drawer-context';
import { PortfolioFacePreviewBar } from '@/components/portfolio/portfolio-face-preview-bar';
import { PageContentDrawer } from '@/components/portfolio/page-content-drawer';
import { PortfolioPageDock } from '@/components/portfolio/portfolio-page-dock';
import { PortfolioCustomize } from '@/components/portfolio/portfolio-customize';
import { PortfolioShell } from '@/components/portfolio/portfolio-shell';
import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
  PublicPageStats,
  ResolvedPageHero,
} from '@/lib/page-data';
import type { ResolvedMood } from '@/lib/moods/types';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { resolvePageFace } from '@/lib/page-face';

interface PortfolioShellRootProps {
  mood: ResolvedMood;
  pageAccountId: string;
  avatarMedia?: ResolvedPageHero | null;
  bannerMedia?: ResolvedPageHero | null;
  committedAvatarMode: PageAvatarMode;
  committedHeroSource: PageHeroSource;
  initialAvatarMode: PageAvatarMode;
  config: PublicPageConfig;
  stats: PublicPageStats;
  profileName?: string | null;
  children: ReactNode;
}

function PortfolioShellPreviewBridge({
  mood,
  pageAccountId,
  avatarMedia,
  bannerMedia,
  config,
  stats,
  profileName,
  children,
}: Omit<
  PortfolioShellRootProps,
  'committedAvatarMode' | 'committedHeroSource' | 'initialAvatarMode'
>) {
  const { effectiveAvatarMode, effectiveHeroSource, isPreviewing } =
    usePortfolioFacePreview();
  const previewConfig = {
    ...config,
    face: {
      ...config.face,
      heroSource: effectiveHeroSource,
    },
  };
  const { hero } = resolvePageFace({
    config: previewConfig,
    avatarMode: effectiveAvatarMode,
    avatarMedia: avatarMedia ?? null,
    bannerMedia: bannerMedia ?? null,
  });
  const hasBanner = Boolean(hero);

  return (
    <>
      <PortfolioShell
        mood={mood}
        config={previewConfig}
        avatarMode={effectiveAvatarMode}
        avatarMedia={avatarMedia}
        bannerMedia={bannerMedia}
        isPreviewing={isPreviewing}
      >
        {children}
      </PortfolioShell>
      <div
        className="portfolio-os-layer"
        data-mood={mood.id}
        data-has-banner={hasBanner ? 'true' : undefined}
        data-mood-only={hasBanner ? undefined : 'true'}
        style={mood.cssVars as CSSProperties}
      >
        <PortfolioCustomize
          pageAccountId={pageAccountId}
          config={config}
          mood={mood}
          avatarUrl={avatarMedia?.url ?? null}
          bannerUrl={bannerMedia?.url ?? null}
        />
        <PortfolioPageDock pageAccountId={pageAccountId} />
        <PageContentDrawer
          pageAccountId={pageAccountId}
          profileName={profileName}
          config={config}
          stats={stats}
          mood={mood}
        />
        <PortfolioFacePreviewBar pageAccountId={pageAccountId} config={config} />
      </div>
    </>
  );
}

export function PortfolioShellRoot({
  committedAvatarMode,
  committedHeroSource,
  initialAvatarMode,
  ...props
}: PortfolioShellRootProps) {
  useEffect(() => {
    document.body.dataset.portfolioClientReady = 'true';
    return () => {
      delete document.body.dataset.portfolioClientReady;
    };
  }, []);

  return (
    <PageContentDrawerProvider>
      <PortfolioFacePreviewProvider
        committedAvatarMode={committedAvatarMode}
        committedHeroSource={committedHeroSource}
        initialAvatarMode={initialAvatarMode}
      >
        <PortfolioShellPreviewBridge {...props} />
      </PortfolioFacePreviewProvider>
    </PageContentDrawerProvider>
  );
}
