'use client';

import { useMemo, type ComponentProps, type CSSProperties } from 'react';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import {
  pageContentDrawerPanelStyle,
  portfolioMoodShellStyle,
} from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';

function slideOverMoodProps(
  mood: ResolvedMood | null,
  isPreviewingMood: boolean
): { moodId: string | null; moodStyle: CSSProperties | undefined } {
  if (!mood) {
    return { moodId: null, moodStyle: undefined };
  }

  return {
    moodId: mood.id,
    moodStyle: {
      ...portfolioMoodShellStyle(mood.cssVars, { preview: isPreviewingMood }),
      ...pageContentDrawerPanelStyle(mood.cssVars),
    } as CSSProperties,
  };
}

/**
 * DAO org slide-overs on a portfolio face — inherit that page's mood wash,
 * not the connected viewer's wallet mood.
 */
export function DaoPageSlideOverScreen({
  pageAccountId,
  open,
  ...props
}: ComponentProps<typeof OsSlideOverScreen> & {
  pageAccountId: string;
}) {
  const preview = usePortfolioMoodPreviewOptional();
  const fetchedMood = usePageOwnerMood(pageAccountId, open);
  const effectiveMood = preview?.effectiveMood ?? fetchedMood;
  const isPreviewingMood = preview?.isPreviewingMood ?? false;
  const { moodId, moodStyle } = useMemo(
    () => slideOverMoodProps(effectiveMood, isPreviewingMood),
    [effectiveMood, isPreviewingMood]
  );

  return (
    <OsSlideOverScreen
      {...props}
      open={open}
      moodId={moodId}
      moodStyle={moodStyle}
    />
  );
}
