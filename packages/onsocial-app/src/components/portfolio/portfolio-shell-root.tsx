'use client';

import {
  Suspense,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { PortfolioFacePreviewProvider } from '@/contexts/portfolio-face-preview-context';
import {
  PortfolioMoodPreviewProvider,
  usePortfolioMoodPreview,
} from '@/contexts/portfolio-mood-preview-context';
import { PageContentDrawerProvider } from '@/contexts/page-content-drawer-context';
import { PortfolioPostPeeksProvider } from '@/contexts/portfolio-post-peeks-context';
import { PortfolioShelfProvider } from '@/contexts/portfolio-shelf-context';
import { PortfolioFacePreviewBar } from '@/components/portfolio/portfolio-face-preview-bar';
import { PortfolioMoodPreviewBar } from '@/components/portfolio/portfolio-mood-preview-bar';
import { PageContentDrawer } from '@/components/portfolio/page-content-drawer';
import { PortfolioPageDock } from '@/components/portfolio/portfolio-page-dock';
import { PortfolioPersonalComposer } from '@/components/portfolio/portfolio-personal-composer';
import { ViewerWalletMoodSync } from '@/components/wallet/viewer-wallet-mood-sync';
import { PortfolioCustomize } from '@/components/portfolio/portfolio-customize';
import { PortfolioShell } from '@/components/portfolio/portfolio-shell';
import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
  PublicPageStats,
  ResolvedPageHero,
} from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import type { ResolvedMood } from '@/lib/moods/types';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { resolvePageFace } from '@/lib/page-face';
import {
  portfolioMoodShellStyle,
  resolvePortfolioMood,
} from '@/lib/moods/resolve';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';

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
  guilds?: ProfileGuildSummary[];
  profileName?: string | null;
  bio?: string | null;
  profileLinks?: unknown;
  drawerMeta: PageDrawerMeta;
  /** Streamed below-fold peeks (Suspense). */
  deferredShelf?: ReactNode;
  children: ReactNode;
}

function PortfolioShellPreviewBridge({
  mood: committedMood,
  pageAccountId,
  avatarMedia,
  bannerMedia,
  config,
  stats,
  guilds = [],
  profileName,
  bio = null,
  profileLinks = null,
  drawerMeta,
  deferredShelf = null,
  children,
}: Omit<
  PortfolioShellRootProps,
  'committedAvatarMode' | 'committedHeroSource' | 'initialAvatarMode'
>) {
  const {
    effectiveAvatarMode,
    effectiveHeroSource,
    isPreviewing: isPreviewingFace,
  } = usePortfolioFacePreview();
  const { effectiveMood, isPreviewingMood } = usePortfolioMoodPreview();
  const isPreviewing = isPreviewingFace || isPreviewingMood;
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
    <PortfolioPostPeeksProvider initialPostPeeks={[]}>
      <PortfolioShelfProvider>
        <>
          <PortfolioShell
            mood={effectiveMood}
            config={previewConfig}
            avatarMode={effectiveAvatarMode}
            avatarMedia={avatarMedia}
            bannerMedia={bannerMedia}
            isPreviewing={isPreviewing}
            isPreviewingMood={isPreviewingMood}
          >
            {children}
          </PortfolioShell>
          <ViewerWalletMoodSync
            pageAccountId={pageAccountId}
            mood={effectiveMood}
          />
          <div
            className="portfolio-os-layer"
            data-mood={effectiveMood.id}
            data-mood-preview={isPreviewingMood ? 'true' : undefined}
            data-has-banner={hasBanner ? 'true' : undefined}
            data-mood-only={hasBanner ? undefined : 'true'}
            style={
              portfolioMoodShellStyle(effectiveMood.cssVars, {
                preview: isPreviewingMood,
              }) as CSSProperties
            }
          >
            <PortfolioCustomize
              pageAccountId={pageAccountId}
              config={config}
              mood={committedMood}
              avatarUrl={avatarMedia?.url ?? null}
              bannerUrl={bannerMedia?.url ?? null}
              bannerKind={bannerMedia?.kind ?? null}
              profileLinks={profileLinks}
              guilds={guilds}
            />
            <PortfolioPersonalComposer pageAccountId={pageAccountId} />
            <PortfolioPageDock pageAccountId={pageAccountId} />
            <PageContentDrawer
              pageAccountId={pageAccountId}
              mood={effectiveMood}
              profileName={profileName}
              bio={bio}
              profileLinks={profileLinks}
              drawerMeta={drawerMeta}
              avatarUrl={avatarMedia?.url ?? null}
              config={config}
              stats={stats}
              guilds={guilds}
            />
            <PortfolioFacePreviewBar
              pageAccountId={pageAccountId}
              config={config}
            />
            <PortfolioMoodPreviewBar
              pageAccountId={pageAccountId}
              config={config}
            />
          </div>
          {/* Suspense owned here — keys on prop-passed elements are ignored. */}
          {deferredShelf != null ? (
            <Suspense fallback={null}>{deferredShelf}</Suspense>
          ) : null}
        </>
      </PortfolioShelfProvider>
    </PortfolioPostPeeksProvider>
  );
}

export function PortfolioShellRoot({
  committedAvatarMode,
  committedHeroSource,
  initialAvatarMode,
  mood,
  config,
  pageAccountId,
  ...props
}: PortfolioShellRootProps) {
  // Soft-fill only when SSR config was empty (indexer lag). Once props have
  // data, always prefer them — including after router.refresh() post-save.
  const [softFillConfig, setSoftFillConfig] = useState<PublicPageConfig | null>(
    null
  );

  useEffect(() => {
    document.body.dataset.portfolioClientReady = 'true';
    return () => {
      delete document.body.dataset.portfolioClientReady;
    };
  }, []);

  useEffect(() => {
    if (Object.keys(config).length > 0) return;
    let cancelled = false;
    void fetchPageConfigFromBrowserProxy(pageAccountId)
      .then((next) => {
        if (cancelled || Object.keys(next).length === 0) return;
        setSoftFillConfig(next as PublicPageConfig);
      })
      .catch(() => {
        // Keep SSR default mood/theme.
      });
    return () => {
      cancelled = true;
    };
  }, [config, pageAccountId]);

  const liveConfig =
    Object.keys(config).length > 0 ? config : (softFillConfig ?? config);
  const liveMood =
    Object.keys(config).length > 0
      ? mood
      : softFillConfig
        ? resolvePortfolioMood(softFillConfig)
        : mood;

  return (
    <PageContentDrawerProvider>
      <PortfolioFacePreviewProvider
        committedAvatarMode={committedAvatarMode}
        committedHeroSource={committedHeroSource}
        initialAvatarMode={initialAvatarMode}
      >
        <PortfolioMoodPreviewProvider
          committedMood={liveMood}
          config={liveConfig}
        >
          <PortfolioShellPreviewBridge
            mood={liveMood}
            config={liveConfig}
            pageAccountId={pageAccountId}
            {...props}
          />
        </PortfolioMoodPreviewProvider>
      </PortfolioFacePreviewProvider>
    </PageContentDrawerProvider>
  );
}
