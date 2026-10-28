'use client';

import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';

/**
 * Page wash — mood preset mixed into `--bg`.
 * Dark 25%, light 30% (`--mood-preset-bg-light`). One recipe for screens
 * and for sheets that portal out of the page.
 */
export const MOOD_BG_PRESET_MIX = '25%';
export const MOOD_BG_PRESET_MIX_LIGHT = '30%';

export interface MoodTheme {
  moodId: string;
  style?: CSSProperties;
}

const MoodThemeContext = createContext<MoodTheme | null>(null);

export function MoodThemeProvider({
  moodId,
  style,
  children,
}: {
  moodId: string | null | undefined;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const value = useMemo<MoodTheme | null>(
    () => (moodId ? { moodId, ...(style ? { style } : {}) } : null),
    [moodId, style]
  );
  return (
    <MoodThemeContext.Provider value={value}>
      {children}
    </MoodThemeContext.Provider>
  );
}

export function useMoodTheme(): MoodTheme | null {
  return useContext(MoodThemeContext);
}

function isTransparentMoodBg(value: unknown): boolean {
  return (
    typeof value === 'string' && value.trim().toLowerCase() === 'transparent'
  );
}

/** Drop a transparent `--mood-bg` so the sheet recomputes the preset mix. */
export function sheetMoodStyle(
  style: CSSProperties | null | undefined
): CSSProperties | undefined {
  if (!style) return undefined;
  if (!isTransparentMoodBg(style['--mood-bg' as keyof CSSProperties])) {
    return style;
  }
  const next: CSSProperties = { ...style };
  delete (next as Record<string, unknown>)['--mood-bg'];
  return next;
}

/**
 * Explicit mood wins. A matching inherited style fills in when the caller
 * passed an id without vars. A different explicit id does not borrow the
 * page style.
 */
export function resolveSheetMood(
  explicit: { moodId?: string | null; style?: CSSProperties | null },
  inherited: MoodTheme | null
): { moodId?: string; style?: CSSProperties } {
  if (explicit.moodId) {
    const style = explicit.style
      ? sheetMoodStyle(explicit.style)
      : inherited?.moodId === explicit.moodId
        ? sheetMoodStyle(inherited.style)
        : undefined;
    return { moodId: explicit.moodId, ...(style ? { style } : {}) };
  }
  if (inherited?.moodId) {
    const style = sheetMoodStyle(inherited.style);
    return { moodId: inherited.moodId, ...(style ? { style } : {}) };
  }
  return {};
}
