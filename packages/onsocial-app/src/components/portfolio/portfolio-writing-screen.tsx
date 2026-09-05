'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { PortfolioPersonalComposer } from '@/components/portfolio/portfolio-personal-composer';
import {
  PortfolioWritingPanel,
  type PortfolioWritingPanelProps,
} from '@/components/portfolio/portfolio-writing-panel';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { portfolioPath } from '@/lib/overlay-routes';

export type PortfolioWritingScreenProps = PortfolioWritingPanelProps & {
  mood: ResolvedMood;
};

export function PortfolioWritingScreen({
  mood,
  ...panel
}: PortfolioWritingScreenProps) {
  return (
    <OsAppScreen
      title="Writing"
      compactChrome
      leading={null}
      dockBack
      backFallbackHref={portfolioPath(panel.accountId)}
      moodId={mood.id}
      moodStyle={portfolioMoodShellStyle(mood.cssVars)}
    >
      {/* Hard refresh has no face composer — register the title sheet here. */}
      <PortfolioPersonalComposer pageAccountId={panel.accountId} />
      <PortfolioWritingPanel {...panel} />
    </OsAppScreen>
  );
}
