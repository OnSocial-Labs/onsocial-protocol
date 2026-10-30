'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { OsPageSheet } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OverlayGlassHeader } from '@/components/overlay/overlay-glass-header';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { PostRichText } from '@/features/home/post-rich-text';
import {
  WritingIdentityToolbar,
  WritingSearchHeading,
} from '@/components/portfolio/portfolio-writing-chrome';
import { OverlayChromeProvider } from '@/contexts/overlay-chrome-context';
import { OverlayDismissProvider } from '@/contexts/overlay-dismiss-context';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  articleExcerpt,
  parseArticleSnapshot,
  resolveArticleCover,
} from '@/lib/article-post-payload';
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
    face && warm.accountId === face.accountId ? (warm.articles ?? []) : [];
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
            rootClassName="writing-shelf-opening"
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
                    articleCount={articles.length}
                  />
                }
              >
                {articles.length > 0 ? (
                  <ul className="portfolio-writing-list">
                    {articles.map((post) => {
                      const article = parseArticleSnapshot(post.value);
                      if (!article) return null;
                      const cover = resolveArticleCover({ value: post.value });
                      const issuedAt =
                        typeof post.blockTimestamp === 'number'
                          ? post.blockTimestamp
                          : Number(post.blockTimestamp) || 0;
                      return (
                        <li key={`${post.accountId}:${post.postId}`}>
                          <div className="portfolio-writing-card">
                            <div
                              className="portfolio-writing-cover"
                              aria-hidden
                            >
                              <PortfolioWritingCover
                                variant="list"
                                title={article.title}
                                coverUrl={cover.coverUrl}
                                cardBg={cover.cardBg}
                                format={cover.format}
                                markShape={cover.markShape}
                                markColor={cover.markColor}
                                accountId={post.accountId}
                                displayName={titleLabel}
                                avatarUrl={face.avatarUrl}
                                postId={post.postId}
                                issuedAt={issuedAt}
                              />
                            </div>
                            <div className="portfolio-writing-card-copy">
                              <h2 className="portfolio-writing-card-title">
                                {article.title}
                              </h2>
                              <p className="portfolio-writing-card-excerpt">
                                <PostRichText
                                  text={articleExcerpt(post.value)}
                                  inlineMarks
                                  emptyFallback=""
                                />
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="portfolio-writing-pending" aria-hidden>
                    <span className="standing-row-shimmer portfolio-writing-pending-row" />
                    <span className="standing-row-shimmer portfolio-writing-pending-row" />
                  </div>
                )}
              </OsAppScreen>
            </div>
          </OsPageSheet>
        )}
      </OverlayDismissProvider>
    </OverlayChromeProvider>
  );
}
