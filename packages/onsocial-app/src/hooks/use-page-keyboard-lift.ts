'use client';

import {
  keyboardFrameTop,
  keyboardSeatPx,
  settleVisualKeyboardFrame,
  visualKeyboardFrame,
} from '@onsocial/ui';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { scrollMobileFieldIntoView } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

export interface PageKeyboardLiftOptions {
  /**
   * Lock this page to the visible viewport. The header stays under the
   * status bar and the footer sits on the keys, so `--os-keyboard-lift` is 0.
   */
  pinRoot?: () => HTMLElement | null;
}

/**
 * Full pages stay full height. `--os-keyboard-lift` raises only the
 * bottom action; the fields scroll between the header and that action.
 * The seat is the overlap still under the keys, so a card that already
 * shrunk does not lift the action a second time.
 * `pinRoot` instead locks that one page to the visible viewport and
 * leaves the lift at 0, so a format row can sit flush on the keys.
 */
export function usePageKeyboardLift(
  active: boolean,
  options?: PageKeyboardLiftOptions
) {
  const viewport = useVisualViewportSheetMetrics(active);
  const keyboardOpen = viewport.isMobile && viewport.lift > 0;
  const pinRoot = options?.pinRoot;
  const pin = Boolean(pinRoot);
  const [measured, setMeasured] = useState<{
    lift: number;
    seat: number;
  } | null>(null);
  const [pinned, setPinned] = useState<{
    top: number;
    height: number;
  } | null>(null);
  if ((!active || !keyboardOpen || !pin) && pinned) {
    setPinned(null);
  }
  const seat =
    measured && measured.lift === viewport.lift ? measured.seat : viewport.lift;

  useEffect(() => {
    if (!active || !keyboardOpen || pin) return;
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
    // Resize is the keyboard. Scroll is the caret — following it lifts the
    // page behind an open drawer and shakes the field.
    visual?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
  }, [active, keyboardOpen, pin, viewport.lift, viewport.height]);

  useLayoutEffect(() => {
    if (!active || !keyboardOpen || !pin) return;
    const measure = () => {
      const node = pinRoot?.() ?? null;
      const visual = window.visualViewport;
      if (!node || !visual) {
        setPinned(null);
        return;
      }
      const fixed = window.getComputedStyle(node).position === 'fixed';
      const parent = fixed ? null : (node.offsetParent as HTMLElement | null);
      const parentRect = parent?.getBoundingClientRect();
      const proposed = settleVisualKeyboardFrame(
        pinned,
        visualKeyboardFrame({
          position: fixed ? 'fixed' : 'absolute',
          parentTop: parentRect?.top ?? 0,
          parentHeight: parentRect?.height ?? 0,
          offsetTop: visual.offsetTop,
          visualHeight: visual.height,
        })
      );
      node.style.top = `${proposed.top}px`;
      node.style.height = `${proposed.height}px`;
      const next = {
        top: keyboardFrameTop({
          appliedTop: proposed.top,
          frameTop: node.getBoundingClientRect().top,
          parentTop: parentRect?.top ?? 0,
        }),
        height: proposed.height,
      };
      if (next.top !== proposed.top) node.style.top = `${next.top}px`;
      setPinned((current) =>
        current && current.top === next.top && current.height === next.height
          ? current
          : next
      );
    };
    measure();
    const frame = window.requestAnimationFrame(measure);
    const visual = window.visualViewport;
    visual?.addEventListener('resize', measure);
    visual?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', measure);
      visual?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [active, keyboardOpen, pin, pinRoot, pinned]);

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
    if (pin) {
      if (!pinned) {
        return {
          ['--os-keyboard-lift' as string]: '0px',
        } as CSSProperties;
      }
      return {
        top: `${pinned.top}px`,
        height: `${pinned.height}px`,
        minHeight: 0,
        maxHeight: 'none',
        bottom: 'auto',
        ['--os-keyboard-lift' as string]: '0px',
      } as CSSProperties;
    }
    return {
      ['--os-keyboard-lift' as string]: `${seat}px`,
    } as CSSProperties;
  }, [keyboardOpen, pin, pinned, seat]);

  return { keyboardOpen, panelStyle, lift: viewport.lift };
}
