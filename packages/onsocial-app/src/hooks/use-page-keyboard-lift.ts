'use client';

import { keyboardSeatPx } from '@onsocial/ui';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { scrollMobileFieldIntoView } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

/**
 * Full pages stay full height. `--os-keyboard-lift` raises only the
 * bottom action; the fields scroll between the header and that action.
 */
export function usePageKeyboardLift(active: boolean) {
  const viewport = useVisualViewportSheetMetrics(active);
  const keyboardOpen = viewport.isMobile && viewport.lift > 0;
  const [seat, setSeat] = useState(0);

  useLayoutEffect(() => {
    if (!active || !keyboardOpen) return;
    const node = document.querySelector<HTMLElement>(
      '.os-slide-over.is-keyboard-open, .glass-sheet-panel.is-page-keyboard'
    );
    const rect = node?.getBoundingClientRect();
    const visual = window.visualViewport;
    const next = keyboardSeatPx({
      lift: viewport.lift,
      rootBottom: rect ? rect.bottom : null,
      rootHeight: rect ? rect.height : 0,
      visualBottom: visual ? visual.offsetTop + visual.height : 0,
    });
    setSeat((current) => (current === next ? current : next));
  }, [active, keyboardOpen, viewport.lift, viewport.height]);

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
  }, [keyboardOpen]);

  const panelStyle = useMemo((): CSSProperties | undefined => {
    if (!keyboardOpen) return undefined;
    return {
      ['--os-keyboard-lift' as string]: `${seat}px`,
    } as CSSProperties;
  }, [keyboardOpen, seat]);

  return { keyboardOpen, panelStyle, lift: viewport.lift };
}
