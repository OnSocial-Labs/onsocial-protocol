import type { CSSProperties } from 'react';
import type { MoodId } from '@/lib/moods/types';

export function accountSheetPageMoodPanel(
  moodId: MoodId | null,
  moodStyle?: CSSProperties
): { panelClassSuffix: string; panelStyle?: CSSProperties } {
  if (!moodId) {
    return { panelClassSuffix: '' };
  }

  const vars = moodStyle as Record<string, string> | undefined;
  const accent =
    vars?.['--mood-accent-chrome'] ??
    vars?.['--mood-preset-accent'] ??
    vars?.['--mood-accent'];

  return {
    panelClassSuffix: ' account-sheet-panel--page-mood',
    panelStyle: {
      '--glass-sheet-accent':
        accent ?? 'var(--mood-accent-chrome, rgb(var(--fg-rgb) / 0.55))',
    } as CSSProperties,
  };
}
