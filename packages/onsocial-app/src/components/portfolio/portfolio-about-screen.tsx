'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  PortfolioAboutPanel,
  type PortfolioAboutPanelProps,
} from '@/components/portfolio/portfolio-about-panel';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { portfolioPath } from '@/lib/overlay-routes';

export type PortfolioAboutScreenProps = PortfolioAboutPanelProps & {
  mood: ResolvedMood;
};

/**
 * Hard-refresh / shared About — no banner, no “About” chrome.
 * Dock leave goes back to the face. Studio spread is the page.
 */
export function PortfolioAboutScreen({
  mood,
  ...panel
}: PortfolioAboutScreenProps) {
  return (
    <OsAppScreen
      title="About"
      compactChrome
      leading={null}
      dockBack
      backFallbackHref={portfolioPath(panel.accountId)}
      moodId={mood.id}
      moodStyle={portfolioMoodShellStyle(mood.cssVars)}
    >
      <PortfolioAboutPanel {...panel} />
    </OsAppScreen>
  );
}
