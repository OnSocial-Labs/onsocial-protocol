'use client';

import { useEffect, useMemo, type CSSProperties } from 'react';
import { scrollMobileFieldIntoView } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

/**
 * Full pages stay full height. `--os-keyboard-lift` raises only the
 * bottom action; the fields scroll between the header and that action.
 */
export function usePageKeyboardLift(active: boolean) {
  const viewport = useVisualViewportSheetMetrics(active);
  const keyboardOpen = viewport.isMobile && viewport.lift > 0;

  useEffect(() => {
    if (!keyboardOpen) return;
    const activeEl = document.activeElement;
    if (
      activeEl instanceof HTMLElement &&
      (activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl.isContentEditable)
    ) {
      scrollMobileFieldIntoView(activeEl);
    }
  }, [keyboardOpen, viewport.lift]);

  const panelStyle = useMemo((): CSSProperties | undefined => {
    if (!keyboardOpen) return undefined;
    return {
      ['--os-keyboard-lift' as string]: `${viewport.lift}px`,
    } as CSSProperties;
  }, [keyboardOpen, viewport.lift]);

  return { keyboardOpen, panelStyle, lift: viewport.lift };
}
