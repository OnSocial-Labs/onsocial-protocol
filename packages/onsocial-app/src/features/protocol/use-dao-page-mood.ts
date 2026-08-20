'use client';

import { useMemo, type CSSProperties } from 'react';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import {
  pageContentDrawerPanelStyle,
  portfolioMoodShellStyle,
} from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';

function daoPageMoodProps(
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
 * DAO portfolio face mood for org overlays — page owner (or live preview),
 * never the visitor wallet mood.
 */
export function useDaoPageMood(
  pageAccountId: string,
  active: boolean
): { moodId: string | null; moodStyle: CSSProperties | undefined } {
  const preview = usePortfolioMoodPreviewOptional();
  const fetchedMood = usePageOwnerMood(pageAccountId, active);
  const effectiveMood = preview?.effectiveMood ?? fetchedMood;
  const isPreviewingMood = preview?.isPreviewingMood ?? false;
  return useMemo(
    () => daoPageMoodProps(effectiveMood, isPreviewingMood),
    [effectiveMood, isPreviewingMood]
  );
}
