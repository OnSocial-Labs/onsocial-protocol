'use client';

import { useMemo, type CSSProperties } from 'react';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import {
  useVisualViewportSheetMetrics,
  type VisualViewportSheetMetrics,
} from '@/hooks/use-visual-viewport-sheet';

/** Cap content-sized commerce sheets; keyboard open clamps to visual viewport. */
export const COMMERCE_SHEET_MAX_HEIGHT_PX = 736;

/**
 * Lift/clamp GlassSheet panels above the mobile keyboard (composer pattern),
 * while keeping content-sized height when the keyboard is closed.
 */
export function commerceSheetKeyboardPanelStyle(
  viewport: VisualViewportSheetMetrics,
  maxHeightPx: number = COMMERCE_SHEET_MAX_HEIGHT_PX
): CSSProperties | undefined {
  if (!viewport.isMobile || viewport.height <= 0 || viewport.lift <= 0) {
    return undefined;
  }
  const height = Math.min(viewport.height, maxHeightPx);
  return {
    height: `${height}px`,
    maxHeight: `${height}px`,
    marginBottom: `calc(${viewport.lift}px - env(safe-area-inset-bottom, 0px))`,
  };
}

/**
 * Keyboard lift + viewer mood for portaled commerce sheets.
 * `panelStyle` merges mood + keyboard (Buy / Sell / Bid / Offer / List).
 * Host-mood sheets (Support / Boost) should use `keyboardStyle` only so
 * viewer dock vars do not overwrite the face.
 */
export function useCommerceSheetKeyboard(sheetOpen: boolean) {
  const viewport = useVisualViewportSheetMetrics(sheetOpen);
  const { moodId, style: moodStyle } = useViewerDockMood();
  const keyboardStyle = useMemo(
    () => commerceSheetKeyboardPanelStyle(viewport),
    [viewport]
  );
  const panelStyle = useMemo(() => {
    if (!moodStyle && !keyboardStyle) return undefined;
    return { ...moodStyle, ...keyboardStyle };
  }, [keyboardStyle, moodStyle]);
  const keyboardOpen = viewport.isMobile && viewport.lift > 0;
  return {
    viewport,
    panelStyle,
    keyboardStyle,
    keyboardOpen,
    moodId: moodId ?? undefined,
  };
}
