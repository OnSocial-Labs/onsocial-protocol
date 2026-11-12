'use client';

import { keyboardSeatPx } from '@onsocial/ui';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { scrollMobileFieldIntoView } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

/**
 * Full pages stay full height. `--os-keyboard-lift` raises only the
 * bottom action; the fields scroll between the header and that action.
 * The seat is the overlap still under the keys, so a card that already
 * shrunk does not lift the action a second time.
 */
export function usePageKeyboardLift(active: boolean) {
  const viewport = useVisualViewportSheetMetrics(active);
  const keyboardOpen = viewport.isMobile && viewport.lift > 0;
  const [measured, setMeasured] = useState<{
    lift: number;
    seat: number;
  } | null>(null);
  const seat =
    measured && measured.lift === viewport.lift ? measured.seat : viewport.lift;

  useEffect(() => {
    if (!active || !keyboardOpen) return;
    const measure = () => {
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
      setMeasured((current) =>
        current && current.lift === viewport.lift && current.seat === next
          ? current
          : { lift: viewport.lift, seat: next }
      );
    };
    const frame = window.requestAnimationFrame(measure);
    const visual = window.visualViewport;
    visual?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
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
