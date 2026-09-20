'use client';

import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import {
  PortfolioWritingArticleScreen,
  type PortfolioWritingArticleScreenProps,
} from '@/components/portfolio/portfolio-writing-article-screen';

/** Glass article from portfolio Writing — same OsAppScreen reader as hard refresh. */
export function PortfolioWritingArticleOverlay(
  props: PortfolioWritingArticleScreenProps
) {
  return (
    <>
      <OverlayPanelChrome ariaTitle="Writing" hideTitle />
      <PortfolioWritingArticleScreen embedded {...props} />
    </>
  );
}
