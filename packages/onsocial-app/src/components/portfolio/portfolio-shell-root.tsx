'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { PortfolioFacePreviewProvider } from '@/contexts/portfolio-face-preview-context';
import { PageContentDrawerProvider } from '@/contexts/page-content-drawer-context';
import { PortfolioFacePreviewBar } from '@/components/portfolio/portfolio-face-preview-bar';
import { PageContentDrawer } from '@/components/portfolio/page-content-drawer';
import { PortfolioPageDock } from '@/components/portfolio/portfolio-page-dock';
import { PortfolioOsChrome } from '@/components/portfolio/portfolio-os-chrome';
import { PortfolioShell } from '@/components/portfolio/portfolio-shell';
import type {
  PageAvatarMode,
  PublicPageConfig,
  PublicPageStats,
  ResolvedPageHero,
} from '@/lib/page-data';
import type { ResolvedMood } from '@/lib/moods/types';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';

interface PortfolioShellRootProps {
  mood: ResolvedMood;
  pageAccountId: string;
  avatarMedia?: ResolvedPageHero | null;
  bannerMedia?: ResolvedPageHero | null;
  committedAvatarMode: PageAvatarMode;
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
  'committedAvatarMode' | 'initialAvatarMode'
>) {
  const { effectiveAvatarMode, isPreviewing } = usePortfolioFacePreview();

  return (
    <>
      <PortfolioShell
        mood={mood}
        config={config}
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
        style={mood.cssVars as CSSProperties}
      >
        <PortfolioOsChrome pageAccountId={pageAccountId} config={config} />
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
        initialAvatarMode={initialAvatarMode}
      >
        <PortfolioShellPreviewBridge {...props} />
      </PortfolioFacePreviewProvider>
    </PageContentDrawerProvider>
  );
}
