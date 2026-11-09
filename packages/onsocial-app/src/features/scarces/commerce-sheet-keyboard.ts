'use client';

import { useMemo, type CSSProperties } from 'react';
import { keyboardDrawerFrameStyle } from '@onsocial/ui';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import {
  useVisualViewportSheetMetrics,
  type VisualViewportSheetMetrics,
} from '@/hooks/use-visual-viewport-sheet';

/** Cap content-sized commerce sheets; keyboard open clamps to visual viewport. */
export const COMMERCE_SHEET_MAX_HEIGHT_PX = 736;

/**
 * Same frame as every other phone drawer (`keyboardDrawerFrameStyle`).
 * Bottom sits on the keys. Top stops at the screen edge. A short drawer
 * stays short; a tall one hugs the edge and scrolls the body.
 */
export function commerceSheetKeyboardPanelStyle(
  viewport: VisualViewportSheetMetrics,
  maxHeightPx: number = COMMERCE_SHEET_MAX_HEIGHT_PX
): CSSProperties | undefined {
  return keyboardDrawerFrameStyle(viewport, maxHeightPx);
}

/**
 * Keyboard lift + viewer mood for portaled commerce sheets.
 * `panelStyle` merges mood + keyboard (Buy / Sell / Bid / Offer / List).
 * Host-mood sheets (Support / Boost) use `keyboardStyle` only so viewer
 * dock vars do not overwrite the face. Color remap is `[data-mood]` —
 * pass `moodId` on the sheet; do not add a feature class for hue.
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
