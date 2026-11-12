'use client';

import { keyboardSeatPx, settleKeyboardDrawerMetrics } from '@onsocial/ui';
import { useEffect, useState, type CSSProperties } from 'react';

/** One lift token for every layout-pinned bar (write dock, messages, create). */
export const OS_KEYBOARD_LIFT_VAR = '--os-keyboard-lift';

/**
 * Pixels to publish as `--os-keyboard-lift`.
 * Pass the measured seat (`readScreenKeyboardSeat`), not the raw overlap,
 * so a card that already ends on the keys does not lift the action again.
 */
export function keyboardLiftCssVars(
  open: boolean,
  liftPx: number
): CSSProperties {
  return {
    [OS_KEYBOARD_LIFT_VAR]: open
      ? `${Math.max(0, Math.round(liftPx))}px`
      : '0px',
  } as CSSProperties;
}

/** The screen that owns a pinned footer or dock. */
export function screenForKeyboardSeat(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const fromField = active.closest<HTMLElement>('.os-app-screen');
    if (fromField) return fromField;
  }
  return (
    document.querySelector<HTMLElement>('.feed-session-front .os-app-screen') ??
    document.querySelector<HTMLElement>('.os-app-screen')
  );
}

/**
 * How far `node` still hangs under the visible viewport.
 * A `100dvh` screen that already shrunk onto the keys returns 0.
 */
export function readScreenKeyboardSeat(
  lift: number,
  node: HTMLElement | null
): number {
  const rect = node?.getBoundingClientRect();
  const visual = window.visualViewport;
  return keyboardSeatPx({
    lift,
    rootBottom: rect ? rect.bottom : null,
    rootHeight: rect ? rect.height : 0,
    visualBottom: visual ? visual.offsetTop + visual.height : 0,
  });
}

/**
 * Seat for a footer positioned against the screen. Until the screen is
 * measured, the raw overlap is used so the button does not flash under
 * the keys. Fixed docks publish the raw overlap themselves.
 */
export function useMeasuredKeyboardSeat(active: boolean, lift: number): number {
  const [measured, setMeasured] = useState<{
    lift: number;
    seat: number;
  } | null>(null);

  useEffect(() => {
    if (!active || lift <= 0 || typeof window === 'undefined') return;
    const measure = () => {
      const next = readScreenKeyboardSeat(lift, screenForKeyboardSeat());
      setMeasured((current) =>
        current && current.lift === lift && current.seat === next
          ? current
          : { lift, seat: next }
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
  }, [active, lift]);

  if (!active || lift <= 0) return 0;
  return measured && measured.lift === lift ? measured.seat : lift;
}

const MOBILE_MAX_WIDTH_PX = 767;

export interface VisualViewportSheetMetrics {
  /** Pixels of layout viewport covered below the visual viewport (keyboard). */
  lift: number;
  /** Visible viewport height in CSS pixels. */
  height: number;
  isMobile: boolean;
}

const IDLE: VisualViewportSheetMetrics = {
  lift: 0,
  height: 0,
  isMobile: false,
};

/**
 * Pin a full page to the visible viewport while the keyboard is up.
 * Fixed layers use the layout offset. Absolute layers are offset from
 * their parent, whose box is in the same coordinates as getBoundingClientRect.
 * The page then ends on the keys, so the footer lift stays 0.
 */
export function visualFramePin(input: {
  position: 'fixed' | 'absolute';
  parentTop: number;
  parentHeight: number;
  offsetTop: number;
  visualHeight: number;
}): { top: number; height: number } {
  if (input.position === 'fixed') {
    return {
      top: Math.max(0, Math.round(input.offsetTop)),
      height: Math.max(0, Math.round(input.visualHeight)),
    };
  }
  const top = Math.max(0, Math.round(-input.parentTop));
  const bottom = Math.min(
    Math.max(0, Math.round(input.parentHeight)),
    Math.round(input.visualHeight - input.parentTop)
  );
  return { top, height: Math.max(0, bottom - top) };
}

/**
 * Slide top that keeps the header on the visible screen.
 * The geometric pin is enough when the card's box moves with the scroll.
 * When the card stays put and the page itself has scrolled above the
 * screen, one correction from the frame's real top brings it back.
 * That correction is not stacked, so a top the browser ignores cannot run away.
 */
export function correctedFrameTop(input: {
  appliedTop: number;
  frameTop: number;
  parentTop: number;
}): number {
  const frameTop = Math.round(input.frameTop);
  const parentTop = Math.round(input.parentTop);
  if (parentTop >= -1 && frameTop < -1) {
    return Math.max(0, -frameTop);
  }
  const desired = Math.max(0, parentTop);
  const error = desired - frameTop;
  if (Math.abs(error) < 2) return input.appliedTop;
  return Math.max(0, input.appliedTop + error);
}

/** Keyboard overlap with the layout viewport. Same pixels drawers use. */
export function readKeyboardOverlapPx(): number {
  if (typeof window === 'undefined') return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  );
}

function readMetrics(): VisualViewportSheetMetrics {
  if (typeof window === 'undefined') return IDLE;

  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`
  ).matches;
  const viewport = window.visualViewport;
  if (!isMobile || !viewport) {
    return {
      lift: 0,
      height: isMobile ? window.innerHeight : 0,
      isMobile,
    };
  }

  return {
    lift: readKeyboardOverlapPx(),
    height: Math.round(viewport.height),
    isMobile: true,
  };
}

/**
 * Tracks visualViewport so bottom sheets can shrink/lift above the mobile
 * keyboard (iOS often leaves layout `dvh` unchanged).
 * Resize is the keyboard. Scroll is the caret chase, and a suggestion bar
 * is smaller than a keyboard — neither should move a pinned action.
 */
export function useVisualViewportSheetMetrics(
  active: boolean
): VisualViewportSheetMetrics {
  const [metrics, setMetrics] = useState<VisualViewportSheetMetrics>(IDLE);

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      return;
    }

    const sync = () => {
      setMetrics((current) =>
        settleKeyboardDrawerMetrics(current, readMetrics())
      );
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', sync);
    window.addEventListener('resize', sync);
    // Defer initial read so we don't sync setState in the effect body.
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return active ? metrics : IDLE;
}
