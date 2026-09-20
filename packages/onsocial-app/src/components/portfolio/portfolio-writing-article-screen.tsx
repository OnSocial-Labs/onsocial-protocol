'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon, OsIconAction } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { ArticleReadProgress } from '@/components/portfolio/article-read-progress';
import {
  PortfolioWritingArticleActions,
  PortfolioWritingArticlePanel,
  type PortfolioWritingArticlePanelProps,
} from '@/components/portfolio/portfolio-writing-article-panel';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useArticleReadChrome } from '@/hooks/use-article-read-chrome';
import { useEssayReturnSearch } from '@/hooks/use-essay-return-search';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
import { writingPath } from '@/lib/overlay-routes';

export type PortfolioWritingArticleScreenProps =
  PortfolioWritingArticlePanelProps & {
    mood: ResolvedMood;
    /** Inside portfolio glass — same reader, no second mood wash. */
    embedded?: boolean;
  };

export function PortfolioWritingArticleScreen({
  mood,
  embedded = false,
  ...panel
}: PortfolioWritingArticleScreenProps) {
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const articleTitle =
    parseArticleSnapshot(panel.post.value)?.title?.trim() || 'Writing';
  const { chromeQuiet, progress, wakeFooter } = useArticleReadChrome(
    scrollRootRef,
    true
  );
  const returnSearch = useEssayReturnSearch();
  const shelfHref = withEssayReturnSearch(
    writingPath(panel.accountId),
    returnSearch
  );
  useRegisterImmersiveChromeQuiet(!embedded);

  return (
    <OsAppScreen
      title={articleTitle}
      heading={<></>}
      immersiveHeader
      scrollRootRef={scrollRootRef}
      compactChrome
      embedded={embedded}
      className={`portfolio-writing-article-screen${
        chromeQuiet ? ' is-chrome-quiet' : ''
      }${wakeFooter ? ' is-wake-footer' : ''}`}
      leading={
        <OsIconAction asChild ariaLabel="Back">
          <Link href={shelfHref} scroll={false} prefetch={false}>
            <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </Link>
        </OsIconAction>
      }
      moodId={embedded ? null : mood.id}
      moodStyle={embedded ? undefined : portfolioMoodShellStyle(mood.cssVars)}
      footer={<PortfolioWritingArticleActions post={panel.post} />}
    >
      <ArticleReadProgress progress={progress} />
      <PortfolioWritingArticlePanel {...panel} showActions={false} />
    </OsAppScreen>
  );
}
