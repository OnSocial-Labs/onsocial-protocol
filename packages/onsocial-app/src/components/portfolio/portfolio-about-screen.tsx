'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  PortfolioAboutPanel,
  type PortfolioAboutPanelProps,
} from '@/components/portfolio/portfolio-about-panel';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import { portfolioPath } from '@/lib/overlay-routes';

/** Hard-refresh / shared About — no banner, dock leave back to the face. */
export function PortfolioAboutScreen(props: PortfolioAboutPanelProps) {
  const { accountId, mood } = props;

  return (
    <OsAppScreen
      title="About"
      compactChrome
      glassChrome
      dockBack
      backFallbackHref={portfolioPath(accountId)}
      moodId={mood.id}
      moodStyle={portfolioMoodShellStyle(mood.cssVars)}
    >
      <PortfolioAboutPanel {...props} />
    </OsAppScreen>
  );
}
