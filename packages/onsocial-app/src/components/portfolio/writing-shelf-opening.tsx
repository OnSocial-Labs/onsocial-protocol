'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { OsPageSheet } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OverlayGlassHeader } from '@/components/overlay/overlay-glass-header';
import {
  PortfolioWritingList,
  WritingShelfFrame,
} from '@/components/portfolio/portfolio-writing-list';
import {
  WritingIdentityToolbar,
  WritingSearchHeading,
} from '@/components/portfolio/portfolio-writing-chrome';
import { OverlayChromeProvider } from '@/contexts/overlay-chrome-context';
import { OverlayDismissProvider } from '@/contexts/overlay-dismiss-context';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { rememberEssayReopen } from '@/lib/essay-return';
import { displayName } from '@/lib/profile-display';
import {
  endPortfolioShelfHop,
  getPortfolioShelfHopServerSnapshot,
  getPortfolioShelfHopSnapshot,
  subscribePortfolioShelfHop,
} from '@/lib/portfolio-shelf-hop';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  getWritingShelfWarmServerSnapshot,
  getWritingShelfWarmSnapshot,
  subscribeWritingShelfWarm,
} from '@/lib/writing-shelf-warm';

/**
 * Writing chrome on the tap, before the shelf route exists.
 * The reader stays underneath until this sheet is covering it.
 */
export function WritingShelfOpening() {
  const router = useRouter();
  const hop = useSyncExternalStore(
    subscribePortfolioShelfHop,
    getPortfolioShelfHopSnapshot,
    getPortfolioShelfHopServerSnapshot
  );
  const warm = useSyncExternalStore(
    subscribeWritingShelfWarm,
    getWritingShelfWarmSnapshot,
    getWritingShelfWarmServerSnapshot
  );
  const face = hop.face;
  const articles =
    face && warm.accountId === face.accountId ? warm.articles : null;
  const portal = typeof document === 'undefined' ? null : document.body;

  if (!hop.active || hop.arrived || !face || !portal) return null;

  const titleLabel = face.titleLabel.trim() || displayName(face.accountId);

  return (
    <OverlayChromeProvider>
      <OverlayDismissProvider
        accountId={face.accountId}
        overlayPresent
        onRequestDismiss={() => {
          if (window.location.pathname === APP_HOME_PATH) {
            endPortfolioShelfHop();
          }
          router.replace(APP_HOME_PATH);
        }}
      >
        {({ sheetOpen, requestDismiss }) => (
          <OsPageSheet
            open={sheetOpen}
            onClose={requestDismiss}
            presentation="appear"
            portalContainer={portal}
            zIndex={SHEET_Z.overlayHost}
            ariaLabelledBy="overlay-title"
            backdropLabel="Close panel"
            keepDock
            panelClassName="portfolio-writing-sheet-panel"
            header={<OverlayGlassHeader panelKey="writing" />}
          >
            <div className="overlay-panel-outlet">
              <OsAppScreen
                title="Writing"
                compactChrome
                glassChrome
                scrollTuck="search"
                leading={null}
                dockBack
                onDockBack={requestDismiss}
                backFallbackHref={APP_HOME_PATH}
                moodId={null}
                embedded
                heading={<WritingSearchHeading interactive={false} />}
                toolbar={
                  <WritingIdentityToolbar
                    accountId={face.accountId}
                    titleLabel={titleLabel}
                    avatarUrl={face.avatarUrl}
                    articleCount={articles?.length ?? 0}
                  />
                }
              >
                {articles ? (
                  <PortfolioWritingList
                    accountId={face.accountId}
                    titleLabel={titleLabel}
                    avatarUrl={face.avatarUrl}
                    articles={articles}
                    query=""
                    showSearch={false}
                    onOpenArticle={(post) => {
                      rememberEssayReopen({
                        accountId: post.accountId,
                        postId: post.postId,
                      });
                    }}
                  />
                ) : (
                  <WritingShelfFrame hidden>
                    <div className="portfolio-writing-pending">
                      <span className="standing-row-shimmer portfolio-writing-pending-row" />
                      <span className="standing-row-shimmer portfolio-writing-pending-row" />
                    </div>
                  </WritingShelfFrame>
                )}
              </OsAppScreen>
            </div>
          </OsPageSheet>
        )}
      </OverlayDismissProvider>
    </OverlayChromeProvider>
  );
}
