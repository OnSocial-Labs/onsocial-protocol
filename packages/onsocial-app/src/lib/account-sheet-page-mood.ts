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
  // Real mood color for washes — not chrome (chrome is lightened and reads white).
  const moodAccent =
    vars?.['--mood-preset-accent'] ?? vars?.['--mood-accent'] ?? null;
  const chromeAccent =
    vars?.['--mood-accent-chrome'] ??
    moodAccent ??
    'var(--mood-accent-chrome, rgb(var(--fg-rgb) / 0.55))';

  return {
    panelClassSuffix: ' account-sheet-panel--page-mood',
    panelStyle: {
      ...(moodAccent
        ? {
            '--mood-accent': moodAccent,
            '--mood-preset-accent': moodAccent,
          }
        : null),
      '--glass-sheet-accent': chromeAccent,
    } as CSSProperties,
  };
}
