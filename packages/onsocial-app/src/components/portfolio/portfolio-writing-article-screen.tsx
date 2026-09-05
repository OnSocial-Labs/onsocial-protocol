'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  PortfolioWritingArticlePanel,
  type PortfolioWritingArticlePanelProps,
} from '@/components/portfolio/portfolio-writing-article-panel';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { writingPath } from '@/lib/overlay-routes';

export type PortfolioWritingArticleScreenProps =
  PortfolioWritingArticlePanelProps & {
    mood: ResolvedMood;
  };

export function PortfolioWritingArticleScreen({
  mood,
  ...panel
}: PortfolioWritingArticleScreenProps) {
  return (
    <OsAppScreen
      title="Writing"
      compactChrome
      leading={null}
      dockBack
      backFallbackHref={writingPath(panel.accountId)}
      moodId={mood.id}
      moodStyle={portfolioMoodShellStyle(mood.cssVars)}
    >
      <PortfolioWritingArticlePanel {...panel} />
    </OsAppScreen>
  );
}
