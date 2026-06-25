'use client';

import type { CSSProperties, ReactNode } from 'react';
import { PortfolioFacePreviewProvider } from '@/contexts/portfolio-face-preview-context';
import { PortfolioFacePreviewBar } from '@/components/portfolio/portfolio-face-preview-bar';
import { PortfolioLauncher } from '@/components/os/summon-launcher';
import { PortfolioOsChrome } from '@/components/portfolio/portfolio-os-chrome';
import { PortfolioShell } from '@/components/portfolio/portfolio-shell';
import type { PageAvatarMode, PublicPageConfig, ResolvedPageHero } from '@/lib/page-data';
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
  children: ReactNode;
}

function PortfolioShellPreviewBridge({
  mood,
  pageAccountId,
  avatarMedia,
  bannerMedia,
  config,
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
        <PortfolioLauncher pageAccountId={pageAccountId} />
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
  return (
    <PortfolioFacePreviewProvider
      committedAvatarMode={committedAvatarMode}
      initialAvatarMode={initialAvatarMode}
    >
      <PortfolioShellPreviewBridge {...props} />
    </PortfolioFacePreviewProvider>
  );
}
